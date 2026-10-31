# Dramify 本地网站

双击本目录中的「启动网站.command」打开网站，保持启动窗口开启。不要直接双击 index.html；浏览器可能阻止它读取 Excel。

## 修改剧集文字

编辑 content/dramas.xlsx，保存后刷新浏览器即可读取新内容。不需要生成更新包。保留 ItemNumber 与七个表头，32 条记录不能删除或重复。简介和标签填写后会显示在剧集详情页。

## 目录说明

- index.html、style.css 和各个 .js：当前网站代码。
- assets：网站使用的图片；图像资源：保留的原始图片。
- content/dramas.xlsx：剧集文字的唯一来源。
- vendor：网站运行所需的第三方库。
- supabase：数据表和数据库配置说明。
- 启动网站.command、local_server.py：本地启动入口。

以前的更新副本已移到上一级「看剧软件历史更新备份」，当前目录只维护这一套网站。

需要发布时由你自行上传网站文件。详细数据配置请参见 supabase 文件夹内的说明。

## 用户资料

入口第一步填写 MTurk Worker ID 和 Access code，Confirm后填写 Nickname、Gender、Age、Country。Country为文本输入，不再收集Job。原Job保存位置用于Worker ID，详情见supabase/当前数据变量.md。Finished确认并上传成功后显示Finish Code，提示返回问卷。

## 当前数据变量（watch-v4）

以 supabase/当前数据变量.md 为当前变量定义。导出时执行 supabase/20261021_current_variables.sql 并使用 dramify_export_current；原导出视图继续保留。
