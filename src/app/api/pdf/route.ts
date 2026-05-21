import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("file");

    if (!fileName) {
      return new NextResponse("Missing file parameter", { status: 400 });
    }

    // 경로 조작 방어 (Directory Traversal 방지)
    const safeFileName = path.basename(fileName);
    const dataDir = path.resolve(process.cwd(), "data");
    const filePath = path.join(dataDir, safeFileName);

    // 보안 검증: resolving된 파일이 실제 data 디렉토리 하위에 위치하는지 확인
    if (!filePath.startsWith(dataDir)) {
      return new NextResponse("Access denied: Invalid file path", { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse("File not found", { status: 404 });
    }

    // 파일 읽기 및 스트리밍
    const fileBuffer = fs.readFileSync(filePath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(safeFileName)}"`,
      },
    });
  } catch (error) {
    console.error("[PDF Stream API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
