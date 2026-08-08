// iosafc.cpp — N-API native addon bridging Node ↔ libimobiledevice AFC.
//
// 暴露给 JS 的方法(见 index.d.ts):
//   connect(udid, pairIfNeeded) -> number(handle)
//   disconnect(handle)
//   isPaired(udid) -> boolean
//   pair(udid) -> boolean              // 触发设备端"信任此电脑"
//   list(handle, path) -> [{name,isDirectory,size,mtime}]
//   stat(handle, path) -> {isDirectory,size,mtime}
//   readFile(handle, path) -> Buffer
//   writeFile(handle, path, buffer)
//   mkdir(handle, path) / remove(handle, path) / rename(handle, from, to)
//
// 设计:JS 侧只拿到整数 handle;C++ 侧用 handle→会话 注册表持有 idevice/lockdown/afc 指针,
// 析构时按序释放(afc→lockdown→device)。避免把裸指针交给 JS。
//
// ⚠ 未编译/未真机验证的脚手架。需在装好 libimobiledevice 开发头文件的机器上 node-gyp build,
// 并用真机回归(配对、可写边界)。个别 free 函数名/枚举以本机安装的头文件为准。

#include <napi.h>

#include <libimobiledevice/libimobiledevice.h>
#include <libimobiledevice/lockdown.h>
#include <libimobiledevice/afc.h>

#include <cstdint>
#include <cerrno>
#include <cstdlib>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

// 一次 iOS 会话:device + lockdown + afc 三件套。
struct Session {
  idevice_t device = nullptr;
  lockdownd_client_t lockdown = nullptr;
  afc_client_t afc = nullptr;
  ~Session() {
    if (afc) afc_client_free(afc);
    if (lockdown) lockdownd_client_free(lockdown);
    if (device) idevice_free(device);
  }
};

std::unordered_map<int64_t, std::unique_ptr<Session>> g_sessions;
int64_t g_next = 1;

// 把错误以 JS 异常抛出(NAPI_DISABLE_CPP_EXCEPTIONS 下用 ThrowAsJavaScriptException)。
Napi::Value Throw(Napi::Env env, const std::string& msg) {
  Napi::Error::New(env, msg).ThrowAsJavaScriptException();
  return env.Undefined();
}

Session* GetSession(int64_t handle) {
  auto it = g_sessions.find(handle);
  return it == g_sessions.end() ? nullptr : it->second.get();
}

// 解析 afc_get_file_info 返回的 key/value 字符串对(以 NULL 结尾的交错数组)。
struct Info {
  bool ok = false;
  bool isDir = false;
  int64_t size = 0;
  int64_t mtime = 0;  // 秒
};

// 例外禁用(NAPI_DISABLE_CPP_EXCEPTIONS)下不能用 try/catch;strtoll 不抛、靠 errno 判定。
int64_t parseLong(const std::string& s) {
  if (s.empty()) return 0;
  errno = 0;
  char* end = nullptr;
  long long v = strtoll(s.c_str(), &end, 10);
  if (errno != 0 || end == s.c_str()) return 0;
  return static_cast<int64_t>(v);
}

Info ParseInfo(char** infos) {
  Info out;
  if (!infos) return out;
  for (int i = 0; infos[i] && infos[i + 1]; i += 2) {
    std::string k = infos[i];
    std::string v = infos[i + 1];
    if (k == "st_ifmt") {
      out.isDir = (v == "S_IFDIR");
      out.ok = true;
    } else if (k == "st_size") {
      out.size = parseLong(v);
    } else if (k == "st_mtime") {
      out.mtime = parseLong(v);
    }
  }
  return out;
}

// 顶层打开 device + lockdown,返回 lockdown(调用方负责释放 device/lockdown 失败路径)。
// 返回 LOCKDOWN_E_SUCCESS 时 *outDevice/*outLockdown 有效。
lockdownd_error_t OpenLockdown(const std::string& udid,
                               idevice_t* outDevice,
                               lockdownd_client_t* outLockdown) {
  *outDevice = nullptr;
  *outLockdown = nullptr;
  if (idevice_new(outDevice, udid.c_str()) != IDEVICE_E_SUCCESS) {
    return LOCKDOWN_E_UNKNOWN_ERROR;
  }
  lockdownd_error_t le =
      lockdownd_client_new(*outDevice, outLockdown, "fileman");
  if (le != LOCKDOWN_E_SUCCESS) {
    idevice_free(*outDevice);
    *outDevice = nullptr;
  }
  return le;
}

Napi::Value Connect(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) return Throw(env, "connect(udid, pairIfNeeded?)");
  std::string udid = info[0].As<Napi::String>().Utf8Value();
  bool pairIfNeeded = info.Length() >= 2 && info[1].IsBoolean() && info[1].As<Napi::Boolean>().Value();

  idevice_t device = nullptr;
  lockdownd_client_t lockdown = nullptr;
  lockdownd_error_t le = OpenLockdown(udid, &device, &lockdown);
  if (le != LOCKDOWN_E_SUCCESS || !device || !lockdown) {
    return Throw(env, "无法连接 iOS 设备(idevice_new/lockdownd_client_new 失败),UDID=" + udid);
  }

  // 校验配对;未配对且 pairIfNeeded 时发起配对(触发设备端信任弹窗)。
  // 注:libimobiledevice 1.3 中函数为 lockdownd_validate_pair(非 _pairing);
  // record 形参按值传入,NULL 表示用本机 host key 校验(不再分配/释放 record)。
  le = lockdownd_validate_pair(lockdown, nullptr);
  if (le != LOCKDOWN_E_SUCCESS) {
    if (pairIfNeeded) {
      le = lockdownd_pair(lockdown, nullptr);  // nullptr record => 设备端弹"信任此电脑"
      if (le == LOCKDOWN_E_SUCCESS) {
        le = lockdownd_validate_pair(lockdown, nullptr);
      }
    }
    if (le != LOCKDOWN_E_SUCCESS) {
      std::string msg = (le == LOCKDOWN_E_PASSWORD_PROTECTED)
                            ? "设备未信任本机,请在设备上点信任并重试"
                            : "设备未配对(需先在设备信任此电脑)";
      lockdownd_client_free(lockdown);
      idevice_free(device);
      return Throw(env, msg);
    }
  }

  // 启动 AFC 服务并建 afc client。
  lockdownd_service_descriptor_t service = nullptr;
  le = lockdownd_start_service(lockdown, "com.apple.afc", &service);
  if (le != LOCKDOWN_E_SUCCESS || !service) {
    lockdownd_client_free(lockdown);
    idevice_free(device);
    return Throw(env, "启动 AFC 服务失败(可能未信任或需解锁设备)");
  }
  afc_client_t afc = nullptr;
  afc_error_t ae = afc_client_new(device, service, &afc);
  lockdownd_service_descriptor_free(service);
  if (ae != AFC_E_SUCCESS || !afc) {
    lockdownd_client_free(lockdown);
    idevice_free(device);
    return Throw(env, "afc_client_new 失败");
  }

  auto session = std::make_unique<Session>();
  session->device = device;
  session->lockdown = lockdown;
  session->afc = afc;
  int64_t id = g_next++;
  g_sessions[id] = std::move(session);
  return Napi::Number::New(env, static_cast<double>(id));
}

Napi::Value Disconnect(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsNumber()) return info.Env().Undefined();
  int64_t id = info[0].As<Napi::Number>().Int64Value();
  g_sessions.erase(id);
  return info.Env().Undefined();
}

Napi::Value IsPaired(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) return Throw(env, "isPaired(udid)");
  std::string udid = info[0].As<Napi::String>().Utf8Value();
  idevice_t device = nullptr;
  lockdownd_client_t lockdown = nullptr;
  if (OpenLockdown(udid, &device, &lockdown) != LOCKDOWN_E_SUCCESS || !lockdown) {
    return Napi::Boolean::New(env, false);
  }
  lockdownd_error_t le = lockdownd_validate_pair(lockdown, nullptr);
  lockdownd_client_free(lockdown);
  if (device) idevice_free(device);
  return Napi::Boolean::New(env, le == LOCKDOWN_E_SUCCESS);
}

Napi::Value Pair(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) return Throw(env, "pair(udid)");
  std::string udid = info[0].As<Napi::String>().Utf8Value();
  idevice_t device = nullptr;
  lockdownd_client_t lockdown = nullptr;
  if (OpenLockdown(udid, &device, &lockdown) != LOCKDOWN_E_SUCCESS || !lockdown) {
    return Throw(env, "无法连接设备以发起配对");
  }
  lockdownd_error_t le = lockdownd_pair(lockdown, nullptr);  // 设备端弹信任
  lockdownd_client_free(lockdown);
  if (device) idevice_free(device);
  return Napi::Boolean::New(env, le == LOCKDOWN_E_SUCCESS);
}

Napi::Value List(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString())
    return Throw(env, "list(handle, path)");
  Session* s = GetSession(info[0].As<Napi::Number>().Int64Value());
  if (!s) return Throw(env, "无效 handle");
  std::string dir = info[1].As<Napi::String>().Utf8Value();

  char** names = nullptr;
  afc_error_t ae = afc_read_directory(s->afc, dir.c_str(), &names);
  if (ae != AFC_E_SUCCESS) return Throw(env, "afc_read_directory 失败: " + std::to_string(ae));

  Napi::Array result = Napi::Array::New(env);
  uint32_t idx = 0;
  if (names) {
    for (int i = 0; names[i]; ++i) {
      std::string name = names[i];
      if (name == "." || name == "..") continue;
      std::string child = dir;
      if (child.empty() || child.back() != '/') child += '/';
      child += name;
      char** meta = nullptr;
      Info fi;
      if (afc_get_file_info(s->afc, child.c_str(), &meta) == AFC_E_SUCCESS) {
        fi = ParseInfo(meta);
        if (meta) afc_dictionary_free(meta);
      }
      Napi::Object o = Napi::Object::New(env);
      o.Set("name", Napi::String::New(env, name));
      o.Set("isDirectory", Napi::Boolean::New(env, fi.isDir));
      o.Set("size", Napi::Number::New(env, static_cast<double>(fi.size)));
      // mtime:AFC 给秒;转毫秒便于 JS Date。某些版本给纳秒,这里按秒处理(真机回归时校准)。
      o.Set("mtime", Napi::Number::New(env, static_cast<double>(fi.mtime * 1000)));
      result[idx++] = o;
    }
    afc_dictionary_free(names);
  }
  return result;
}

Napi::Value Stat(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString())
    return Throw(env, "stat(handle, path)");
  Session* s = GetSession(info[0].As<Napi::Number>().Int64Value());
  if (!s) return Throw(env, "无效 handle");
  std::string path = info[1].As<Napi::String>().Utf8Value();

  char** meta = nullptr;
  if (afc_get_file_info(s->afc, path.c_str(), &meta) != AFC_E_SUCCESS || !meta)
    return Throw(env, "afc_get_file_info 失败(路径不存在?)");
  Info fi = ParseInfo(meta);
  afc_dictionary_free(meta);
  Napi::Object o = Napi::Object::New(env);
  o.Set("isDirectory", Napi::Boolean::New(env, fi.isDir));
  o.Set("size", Napi::Number::New(env, static_cast<double>(fi.size)));
  o.Set("mtime", Napi::Number::New(env, static_cast<double>(fi.mtime * 1000)));
  return o;
}

Napi::Value ReadFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString())
    return Throw(env, "readFile(handle, path)");
  Session* s = GetSession(info[0].As<Napi::Number>().Int64Value());
  if (!s) return Throw(env, "无效 handle");
  std::string path = info[1].As<Napi::String>().Utf8Value();

  uint64_t handle = 0;
  if (afc_file_open(s->afc, path.c_str(), AFC_FOPEN_RDONLY, &handle) != AFC_E_SUCCESS)
    return Throw(env, "afc_file_open 失败: " + path);
  std::vector<char> buf;
  const uint32_t kChunk = 1 << 16;
  std::vector<char> chunk(kChunk);
  while (true) {
    uint32_t got = 0;
    afc_error_t ae = afc_file_read(s->afc, handle, chunk.data(), kChunk, &got);
    if (ae != AFC_E_SUCCESS) {
      afc_file_close(s->afc, handle);
      return Throw(env, "afc_file_read 失败");
    }
    if (got == 0) break;
    buf.insert(buf.end(), chunk.data(), chunk.data() + got);
    if (got < kChunk) break;  // 读到尾
  }
  afc_file_close(s->afc, handle);
  return Napi::Buffer<char>::Copy(env, buf.data(), buf.size());
}

Napi::Value WriteFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsBuffer())
    return Throw(env, "writeFile(handle, path, buffer)");
  Session* s = GetSession(info[0].As<Napi::Number>().Int64Value());
  if (!s) return Throw(env, "无效 handle");
  std::string path = info[1].As<Napi::String>().Utf8Value();
  auto data = info[2].As<Napi::Buffer<char>>();

  uint64_t handle = 0;
  if (afc_file_open(s->afc, path.c_str(), AFC_FOPEN_WRONLY, &handle) != AFC_E_SUCCESS)
    return Throw(env, "afc_file_open(写) 失败: " + path);
  const char* p = data.Data();
  uint32_t remaining = static_cast<uint32_t>(data.Length());
  const uint32_t kChunk = 1 << 16;
  while (remaining > 0) {
    uint32_t toWrite = remaining < kChunk ? remaining : kChunk;
    uint32_t wrote = 0;
    if (afc_file_write(s->afc, handle, p, toWrite, &wrote) != AFC_E_SUCCESS || wrote == 0) {
      afc_file_close(s->afc, handle);
      return Throw(env, "afc_file_write 失败");
    }
    p += wrote;
    remaining -= wrote;
  }
  afc_file_close(s->afc, handle);
  return env.Undefined();
}

Napi::Value Mkdir(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) return Throw(env, "mkdir(handle, path)");
  Session* s = GetSession(info[0].As<Napi::Number>().Int64Value());
  if (!s) return Throw(env, "无效 handle");
  std::string path = info[1].As<Napi::String>().Utf8Value();
  if (afc_make_directory(s->afc, path.c_str()) != AFC_E_SUCCESS)
    return Throw(env, "afc_make_directory 失败");
  return env.Undefined();
}

Napi::Value Remove(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) return Throw(env, "remove(handle, path)");
  Session* s = GetSession(info[0].As<Napi::Number>().Int64Value());
  if (!s) return Throw(env, "无效 handle");
  std::string path = info[1].As<Napi::String>().Utf8Value();
  if (afc_remove_path(s->afc, path.c_str()) != AFC_E_SUCCESS)
    return Throw(env, "afc_remove_path 失败");
  return env.Undefined();
}

Napi::Value Rename(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsString())
    return Throw(env, "rename(handle, from, to)");
  Session* s = GetSession(info[0].As<Napi::Number>().Int64Value());
  if (!s) return Throw(env, "无效 handle");
  std::string from = info[1].As<Napi::String>().Utf8Value();
  std::string to = info[2].As<Napi::String>().Utf8Value();
  if (afc_rename_path(s->afc, from.c_str(), to.c_str()) != AFC_E_SUCCESS)
    return Throw(env, "afc_rename_path 失败");
  return env.Undefined();
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "connect"), Napi::Function::New(env, Connect));
  exports.Set(Napi::String::New(env, "disconnect"), Napi::Function::New(env, Disconnect));
  exports.Set(Napi::String::New(env, "isPaired"), Napi::Function::New(env, IsPaired));
  exports.Set(Napi::String::New(env, "pair"), Napi::Function::New(env, Pair));
  exports.Set(Napi::String::New(env, "list"), Napi::Function::New(env, List));
  exports.Set(Napi::String::New(env, "stat"), Napi::Function::New(env, Stat));
  exports.Set(Napi::String::New(env, "readFile"), Napi::Function::New(env, ReadFile));
  exports.Set(Napi::String::New(env, "writeFile"), Napi::Function::New(env, WriteFile));
  exports.Set(Napi::String::New(env, "mkdir"), Napi::Function::New(env, Mkdir));
  exports.Set(Napi::String::New(env, "remove"), Napi::Function::New(env, Remove));
  exports.Set(Napi::String::New(env, "rename"), Napi::Function::New(env, Rename));
  return exports;
}

NODE_API_MODULE(iosafc, Init)
