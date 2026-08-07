import os

def add_prefix_to_files(prefix: str):
    current_dir = os.getcwd()
    for filename in os.listdir(current_dir):
        full_path = os.path.join(current_dir, filename)

        if os.path.isfile(full_path) and not filename.startswith(prefix):
            new_name = prefix + filename
            new_full_path = os.path.join(current_dir, new_name)
            os.rename(full_path, new_full_path)
            print(f'[Prefix] Renamed: {filename} -> {new_name}')

def replace_in_filenames(old: str, new: str):
    current_dir = os.getcwd()
    for filename in os.listdir(current_dir):
        full_path = os.path.join(current_dir, filename)

        if os.path.isfile(full_path) and old in filename:
            new_name = filename.replace(old, new)
            new_full_path = os.path.join(current_dir, new_name)
            os.rename(full_path, new_full_path)
            print(f'[Replace] Renamed: {filename} -> {new_name}')

if __name__ == '__main__':
    print("请选择操作类型：")
    print("1. 添加前缀")
    print("2. 替换文件名中的字符串")
    choice = input("输入选项 (1 or 2): ").strip()

    if choice == '1':
        prefix = input("请输入前缀: ").strip()
        add_prefix_to_files(prefix)
    elif choice == '2':
        old = input("要替换的原字符串: ").strip()
        new = input("新的字符串: ").strip()
        replace_in_filenames(old, new)
    else:
        print("无效的选项。请输入 1 或 2。")
