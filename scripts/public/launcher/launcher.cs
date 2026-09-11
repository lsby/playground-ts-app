using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace LsbyLauncher
{
    static class Program
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool AllocConsole();

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool FreeConsole();

        static readonly object consoleLock = new object();
        static readonly Queue<string> pendingLogs = new Queue<string>();
        static bool isConsoleVisible = false;
        static StreamWriter consoleWriter = null;
        static StreamReader consoleReader = null;

        static void WriteLog(string message)
        {
            lock (consoleLock)
            {
                if (isConsoleVisible)
                {
                    try
                    {
                        Console.WriteLine(message);
                        return;
                    }
                    catch
                    {
                        isConsoleVisible = false;
                    }
                }

                pendingLogs.Enqueue(message);
                while (pendingLogs.Count > 2000)
                {
                    pendingLogs.Dequeue();
                }
            }
        }

        static bool ShowConsole()
        {
            lock (consoleLock)
            {
                if (isConsoleVisible)
                {
                    return true;
                }
                if (!AllocConsole())
                {
                    return false;
                }

                consoleWriter = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
                consoleWriter.AutoFlush = true;
                consoleReader = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
                Console.SetOut(consoleWriter);
                Console.SetError(consoleWriter);
                Console.SetIn(consoleReader);
                Console.OutputEncoding = Encoding.UTF8;
                isConsoleVisible = true;

                while (pendingLogs.Count > 0)
                {
                    Console.WriteLine(pendingLogs.Dequeue());
                }
                return true;
            }
        }

        static void HideConsole()
        {
            lock (consoleLock)
            {
                if (!isConsoleVisible)
                {
                    return;
                }

                Console.SetOut(TextWriter.Null);
                Console.SetError(TextWriter.Null);
                Console.SetIn(TextReader.Null);
                if (consoleWriter != null)
                {
                    consoleWriter.Dispose();
                    consoleWriter = null;
                }
                if (consoleReader != null)
                {
                    consoleReader.Dispose();
                    consoleReader = null;
                }
                FreeConsole();
                isConsoleVisible = false;
            }
        }

        static void ToggleConsole()
        {
            if (isConsoleVisible)
            {
                HideConsole();
            }
            else
            {
                ShowConsole();
            }
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string appPath = Path.Combine(baseDir, "app", "lsby-playground-ts-app.exe");
            string markerPath = Path.Combine(baseDir, "data", "update-in-progress");

            if (File.Exists(markerPath))
            {
                ShowConsole();
                WriteLog("检测到未完成的更新，请先运行 update.cmd 恢复旧版本。");
                WriteLog("按任意键关闭...");
                if (isConsoleVisible)
                {
                    Console.ReadKey();
                }
                return;
            }

            WriteLog("==================================================");
            WriteLog("lsby-playground-ts-app 启动引导器");
            WriteLog("==================================================");

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
                ToggleConsole();
            };

            trayIcon.DoubleClick += (s, e) =>
            {
                ToggleConsole();
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
                Environment.SetEnvironmentVariable("DEBUG", "@lsby:*,@lsby:playground-ts-app:*");
            }

            Process appProcess = new Process();
            appProcess.StartInfo.FileName = appPath;
            appProcess.StartInfo.WorkingDirectory = baseDir;
            appProcess.StartInfo.UseShellExecute = false;
            appProcess.StartInfo.CreateNoWindow = true;
            appProcess.StartInfo.RedirectStandardOutput = true;
            appProcess.StartInfo.RedirectStandardError = true;

            appProcess.OutputDataReceived += (s, e) =>
            {
                if (e.Data != null)
                {
                    WriteLog(e.Data);
                }
            };
            appProcess.ErrorDataReceived += (s, e) =>
            {
                if (e.Data != null)
                {
                    WriteLog(e.Data);
                }
            };

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
                    ShowConsole();
                    WriteLog("\n[引导器拦截] 程序异常退出 (ExitCode: " + appProcess.ExitCode + ")");
                    WriteLog("按任意键关闭...");
                    if (isConsoleVisible)
                    {
                        Console.ReadKey();
                    }
                }
                Application.Exit();
            };

            try
            {
                WriteLog("正在启动...");
                appProcess.Start();
                appProcess.BeginOutputReadLine();
                appProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                ShowConsole();
                WriteLog("\n[引导器错误] 启动失败: " + ex.Message);
                WriteLog("确保 app/lsby-playground-ts-app.exe 存在。");
                WriteLog("按任意键关闭...");
                if (isConsoleVisible)
                {
                    Console.ReadKey();
                }
                trayIcon.Visible = false;
                Application.Exit();
                return;
            }

            // 启动消息循环以维持托盘和事件响应
            Application.Run();
        }
    }
}
