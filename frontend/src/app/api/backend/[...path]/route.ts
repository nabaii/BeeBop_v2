import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const BACKEND_API_URL = process.env.BACKEND_API_URL?.replace(/\/$/, '');

function backendUrl(request: NextRequest, path: string[]): URL | null {
  if (!BACKEND_API_URL) return null;
  const url = new URL(`${BACKEND_API_URL}/${path.join('/')}`);
  url.search = request.nextUrl.search;
  return url;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const params = await context.params;
  const target = backendUrl(request, params.path ?? []);
  if (!target) {
    return NextResponse.json(
      {
        error: {
          code: 'backend_api_url_missing',
          message: 'Backend API URL is not configured.',
        },
      },
      { status: 503 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}
