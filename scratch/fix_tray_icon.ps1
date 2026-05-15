Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('c:\Users\nirde\Desktop\Deskify\src-tauri\icons\Logo\DeskifyLogo_square.png')
$trayImg = New-Object System.Drawing.Bitmap(32, 32)
$g = [System.Drawing.Graphics]::FromImage($trayImg)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 32, 32)
$trayImg.Save('c:\Users\nirde\Desktop\Deskify\src-tauri\icons\tray.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$trayImg.Dispose()
$img.Dispose()
