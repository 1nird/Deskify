Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('c:\Users\nirde\Desktop\Deskify\src-tauri\icons\Logo\DeskifyLogo.png')
$img.Save('c:\Users\nirde\Desktop\Deskify\src-tauri\icons\Logo\DeskifyLogo_fixed.png', [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
