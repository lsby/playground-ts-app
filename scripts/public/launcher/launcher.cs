using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace LsbyLauncher
{
    static class Program
    {
        // 去除 AllocConsole，因为我们现在用 target:exe 编译，系统会自动分配
        // [DllImport("kernel32.dll")]
        // static extern bool AllocConsole();

        [DllImport("kernel32.dll")]
        static extern IntPtr GetConsoleWindow();

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        const int SW_HIDE = 0;
        const int SW_SHOW = 5;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string appPath = Path.Combine(baseDir, "app", "lsby-playground-ts-service.exe");
            string markerPath = Path.Combine(baseDir, "data", "update-in-progress");
            IntPtr consoleWindow = GetConsoleWindow();
            ShowWindow(consoleWindow, SW_HIDE);
            bool isConsoleVisible = false;

            // 解决中文乱码
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            if (File.Exists(markerPath))
            {
                ShowWindow(consoleWindow, SW_SHOW);
                Console.WriteLine("检测到未完成的更新，请先运行 update.cmd 恢复旧版本。");
                Console.WriteLine("按任意键关闭...");
                Console.ReadKey();
                return;
            }

            Console.WriteLine("==================================================");
            Console.WriteLine("lsby-playground-ts-service 启动引导器");
            Console.WriteLine("==================================================");

            // 2. 准备托盘图标
            NotifyIcon trayIcon = new NotifyIcon();
            trayIcon.Text = "Playground Service";
            trayIcon.Visible = true;

            // 尝试读取应用本身的图标，失败则用默认图标
            try {
                trayIcon.Icon = Icon.ExtractAssociatedIcon(appPath);
            } catch {
                trayIcon.Icon = SystemIcons.Application;
            }

            ContextMenu contextMenu = new ContextMenu();
            MenuItem toggleMenuItem = new MenuItem("显示/隐藏控制台");
            MenuItem exitMenuItem = new MenuItem("退出程序");
            contextMenu.MenuItems.Add(toggleMenuItem);
            contextMenu.MenuItems.Add(exitMenuItem);
            trayIcon.ContextMenu = contextMenu;

            toggleMenuItem.Click += (s, e) =>
            {
                isConsoleVisible = !isConsoleVisible;
                ShowWindow(consoleWindow, isConsoleVisible ? SW_SHOW : SW_HIDE);
            };

            trayIcon.DoubleClick += (s, e) =>
            {
                isConsoleVisible = !isConsoleVisible;
                ShowWindow(consoleWindow, isConsoleVisible ? SW_SHOW : SW_HIDE);
            };

            // 3. 准备启动进程
            Environment.CurrentDirectory = baseDir;
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ENV_FILE_PATH")))
            {
                string envDir = Path.Combine(baseDir, "app", ".env");
                if (Directory.Exists(envDir))
                {
                    string[] envFiles = Directory.GetFiles(envDir, ".env.production.*");
                    if (envFiles.Length > 0)
                    {
                        string relativePath = Path.Combine("app", ".env", Path.GetFileName(envFiles[0]));
                        Environment.SetEnvironmentVariable("ENV_FILE_PATH", relativePath);
                    }
                }
            }

            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DEBUG")))
            {
                Environment.SetEnvironmentVariable("DEBUG", "@lsby:*,@lsby:playground-ts-service:*");
            }

            Process appProcess = new Process();
            appProcess.StartInfo.FileName = appPath;
            appProcess.StartInfo.WorkingDirectory = baseDir;
            appProcess.StartInfo.UseShellExecute = false; // 继承当前引导器的控制台句柄，这样日志会打印到我们的黑框里

            exitMenuItem.Click += (s, e) =>
            {
                trayIcon.Visible = false;
                try {
                    if (!appProcess.HasExited) {
                        appProcess.Kill();
                    }
                } catch { }
                Application.Exit();
            };

            appProcess.EnableRaisingEvents = true;
            appProcess.Exited += (s, e) =>
            {
                trayIcon.Visible = false;
                if (appProcess.ExitCode != 0)
                {
                    // 异常退出兜底：强制弹出黑框框显示报错
                    ShowWindow(consoleWindow, SW_SHOW);
                    Console.WriteLine("\n[引导器拦截] 程序异常退出 (ExitCode: " + appProcess.ExitCode + ")");
                    Console.WriteLine("按任意键关闭...");
                    Console.ReadKey();
                }
                Application.Exit();
            };

            try
            {
                Console.WriteLine("正在启动...");
                appProcess.Start();
            }
            catch (Exception ex)
            {
                ShowWindow(consoleWindow, SW_SHOW);
                Console.WriteLine("\n[引导器错误] 启动失败: " + ex.Message);
                Console.WriteLine("确保 app/lsby-playground-ts-service.exe 存在。");
                Console.WriteLine("按任意键关闭...");
                Console.ReadKey();
                trayIcon.Visible = false;
                Application.Exit();
                return;
            }

            // 启动消息循环以维持托盘和事件响应
            Application.Run();
        }
    }
}
