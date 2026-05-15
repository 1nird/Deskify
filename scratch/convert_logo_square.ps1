Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('c:\Users\nirde\Desktop\Deskify\src-tauri\icons\Logo\DeskifyLogo.png')
$maxDim = [Math]::Max($img.Width, $img.Height)
$squareImg = New-Object System.Drawing.Bitmap($maxDim, $maxDim)
$g = [System.Drawing.Graphics]::FromImage($squareImg)
$g.Clear([System.Drawing.Color]::Transparent)
$x = ($maxDim - $img.Width) / 2
$y = ($maxDim - $img.Height) / 2
$g.DrawImage($img, $x, $y, $img.Width, $img.Height)
$squareImg.Save('c:\Users\nirde\Desktop\Deskify\src-tauri\icons\Logo\DeskifyLogo_square.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$squareImg.Dispose()
$img.Dispose()
