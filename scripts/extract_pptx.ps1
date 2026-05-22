try {
    $pptPath = "c:\Users\vbnm9\source\google-ai-agent\docs\UnHarnesedYU_04.pptx"
    $outputPath = "c:\Users\vbnm9\source\google-ai-agent\docs\pptx_text.txt"
    
    # COM 개체 생성
    $ppt = New-Object -ComObject PowerPoint.Application
    # 프레젠테이션 열기 (ReadOnly: True, Untitled: False, WithWindow: False)
    $presentation = $ppt.Presentations.Open($pptPath, $true, $true, $false)
    
    $text = ""
    foreach ($slide in $presentation.Slides) {
        $text += "=== Slide $($slide.SlideIndex) ===`n"
        
        # 슬라이드 노트 텍스트 추출 (있는 경우)
        if ($slide.NotesPage) {
            foreach ($shape in $slide.NotesPage.Shapes) {
                if ($shape.HasTextFrame -and $shape.TextFrame.HasText -and $shape.PlaceholderFormat.Type -eq 2) {
                    $text += "[Notes] $($shape.TextFrame.TextRange.Text)`n"
                }
            }
        }
        
        # 슬라이드 셰이프 텍스트 추출
        foreach ($shape in $slide.Shapes) {
            # 그룹 셰이프 처리
            if ($shape.Type -eq 6) { # msoGroup
                foreach ($subShape in $shape.GroupItems) {
                    if ($subShape.HasTextFrame -and $subShape.TextFrame.HasText) {
                        $text += "$($subShape.TextFrame.TextRange.Text)`n"
                    }
                }
            }
            elseif ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
                $text += "$($shape.TextFrame.TextRange.Text)`n"
            }
            
            # 표(Table) 내부 텍스트 처리
            if ($shape.HasTable) {
                $table = $shape.Table
                for ($r = 1; $r -le $table.Rows.Count; $r++) {
                    for ($c = 1; $c -le $table.Columns.Count; $c++) {
                        $cell = $table.Cell($r, $c)
                        if ($cell.Shape.TextFrame.HasText) {
                            $text += "Table[$r,$c]: $($cell.Shape.TextFrame.TextRange.Text)`n"
                        }
                    }
                }
            }
        }
        $text += "`n"
    }
    
    $presentation.Close()
    $ppt.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
    
    $text | Out-File -FilePath $outputPath -Encoding utf8
    Write-Host "Success"
} catch {
    Write-Error $_.Exception.Message
}
