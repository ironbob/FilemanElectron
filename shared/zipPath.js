/**
 * ZIP 虚拟路径协议（单一事实源，main 与 renderer 共用）
 *
 * 一个位于 ZIP 内部的路径编码为 `"<zipFilePath>::<innerPath>"`（分隔符
 * 字面量 '::'）。此前该解析逻辑有三份手写实现（electron/main.ts、
 * src/stores/tabs.ts、src/components/FilePane.vue），边界处理已出现方言
 * （如结尾 '/' 是否归一）。本模块收敛全部解析/构造/导航操作：
 *
 * 约定（IFC-1/IFC-2 契约）：
 * - innerPath 归一化：无结尾 '/'，'' 表示 ZIP 根。
 * - 往返一致：joinZipPath(parse(p)) === 归一化(p)。
 * - zipVirtualParent：inner 非根 → 去掉最后一段；inner 为根 → 退到 ZIP
 *   文件所在的文件系统父目录（根目录兜底 '/'）。
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
export var ZIP_PATH_SEP = '::';
/** 路径是否为 ZIP 虚拟路径（包含 '::' 分隔符）。 */
export function isZipVirtualPath(p) {
    return p.includes(ZIP_PATH_SEP);
}
/**
 * 解析虚拟路径。容错：无 '::' 时视为普通文件系统路径（zipFilePath=p、
 * innerPath=''）。innerPath 已归一化（无结尾 '/'，'' 表示 ZIP 根）。
 */
export function parseZipVirtualPath(p) {
    var idx = p.indexOf(ZIP_PATH_SEP);
    if (idx === -1) {
        return { zipFilePath: p, innerPath: '' };
    }
    var zipFilePath = p.slice(0, idx);
    var rawInner = p.slice(idx + ZIP_PATH_SEP.length);
    return { zipFilePath: zipFilePath, innerPath: normalizeInnerPath(rawInner) };
}
/** 归一化 ZIP 内部路径：去结尾 '/'，'' 表示根。 */
function normalizeInnerPath(innerPath) {
    return innerPath.replace(/\/+$/, '');
}
/** 构造虚拟路径。innerPath 为 '' 或 '/' 时表示 ZIP 根（`<zip>::`）。 */
export function joinZipPath(zipFilePath, innerPath) {
    var inner = normalizeInnerPath(innerPath);
    return inner ? "".concat(zipFilePath).concat(ZIP_PATH_SEP).concat(inner) : "".concat(zipFilePath).concat(ZIP_PATH_SEP);
}
/**
 * 向上一级（goUp 语义）：
 * - inner 非根 → ZIP 内部去最后一段；
 * - inner 为根 → 退出到 ZIP 文件所在的文件系统父目录（'/' 兜底）。
 * 前置条件：isZipVirtualPath(p) === true。
 */
export function zipVirtualParent(p) {
    var _a = parseZipVirtualPath(p), zipFilePath = _a.zipFilePath, innerPath = _a.innerPath;
    var parts = innerPath.split('/').filter(Boolean);
    if (parts.length > 0) {
        parts.pop();
        return joinZipPath(zipFilePath, parts.join('/'));
    }
    // Already at ZIP root → exit to the ZIP file's parent directory.
    var fsParent = zipFilePath.split('/').slice(0, -1).join('/') || '/';
    return fsParent;
}
/**
 * 面包屑 segments：ZIP 文件宿主路径段 + 内部路径段（FilePane 现语义）。
 * 非虚拟路径直接返回文件系统路径段。
 */
export function zipBreadcrumbSegments(p) {
    var _a = parseZipVirtualPath(p), zipFilePath = _a.zipFilePath, innerPath = _a.innerPath;
    var fsSegments = zipFilePath.split('/').filter(Boolean);
    var innerSegs = innerPath ? innerPath.split('/').filter(Boolean) : [];
    return __spreadArray(__spreadArray([], fsSegments, true), innerSegs, true);
}
