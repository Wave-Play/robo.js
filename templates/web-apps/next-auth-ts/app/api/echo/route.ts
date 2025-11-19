import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    return NextResponse.json({
      message: 'Hello from Next.js API!',
      received: body,
      timestamp: new Date().toISOString(),
      compatibility: 'Robo.js + Next.js = 💜'
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }
}
