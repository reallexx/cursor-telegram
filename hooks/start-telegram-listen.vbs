' Run telegram-listen with no console window (Windows)
Option Explicit
Dim sh, homedir, nodeCmd, listenJs, fso
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
homedir = sh.ExpandEnvironmentStrings("%USERPROFILE%")
listenJs = homedir & "\.cursor\hooks\telegram-listen.mjs"
If Not fso.FileExists(listenJs) Then WScript.Quit 1

' Prefer node from PATH
On Error Resume Next
nodeCmd = "node"
sh.Run "cmd /c where node >nul 2>&1", 0, True
If Err.Number <> 0 Or sh.Run("cmd /c where node >nul 2>&1", 0, True) <> 0 Then
  If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
    nodeCmd = """C:\Program Files\nodejs\node.exe"""
  Else
    WScript.Quit 1
  End If
End If
On Error GoTo 0

sh.CurrentDirectory = homedir & "\.cursor"
' 0 = hidden window, False = do not wait
sh.Run nodeCmd & " """ & listenJs & """", 0, False
