; Start-menu uninstall entry. Never remove the external UniAppTools workspace.
!macro customInstall
  CreateDirectory "$SMPROGRAMS\河豚打包器"
  CreateShortCut "$SMPROGRAMS\河豚打包器\卸载河豚打包器.lnk" "$INSTDIR\${UNINSTALL_FILENAME}" "" "$INSTDIR\${UNINSTALL_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\河豚打包器\卸载河豚打包器.lnk"
!macroend

; Installation and removal must never kill a running build or discard edits.
!macro customCheckAppRunning
  hetunCheckRunning:
  nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  ${If} $R0 == 0
    Sleep 1000
    nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
    Pop $R0
    ${If} $R0 == 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "请先保存并关闭河豚打包器，再点击重试。安装和卸载不会强制结束你的构建任务。" /SD IDCANCEL IDRETRY hetunCheckRunning
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend
