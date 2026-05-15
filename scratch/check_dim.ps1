Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('c:\Users\nirde\Desktop\Deskify\src-tauri\icons\Logo\DeskifyLogo_fixed.png')
Write-Output "$($img.Width)x$($img.Height)"
$img.Dispose()
