import { jwtVerify } from 'jose';

export const config = {
    matcher: ['/((?!_next|api|.*\\..*).*)'],
};

// 从 Cookie 中获取值
function getCookie(request, name) {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp(`(?:^|; )` + name + `=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

// 验证 JWT
async function verifySession(request) {
    const token = getCookie(request, 'session');
    if (!token) return false;

    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default_jwt_secret');
        await jwtVerify(token, secret);
        return true;
    } catch {
        return false;
    }
}

// 构建企业微信 OAuth URL
function buildWeComOAuthUrl(request) {
    const corpId = process.env.WECOM_CORP_ID;
    const agentId = process.env.WECOM_AGENT_ID;
    const siteUrl = process.env.SITE_URL || new URL(request.url).origin;
    const redirectUri = encodeURIComponent(`${siteUrl}/api/auth/callback`);

    // 企业微信 OAuth 扫码登录 URL
    return `https://login.work.weixin.qq.com/wwlogin/sso/login?login_type=CorpApp&appid=${corpId}&agentid=${agentId}&redirect_uri=${redirectUri}`;
}

export default async function middleware(request) {
    try {
        const url = new URL(request.url);

        // 放行 API 路由
        if (url.pathname.startsWith('/api/')) {
            return new Response(null, { headers: { 'x-middleware-next': '1' } });
        }

        // 验证 session
        const isValid = await verifySession(request);

        if (isValid) {
            // 已登录，放行请求
            return new Response(null, { headers: { 'x-middleware-next': '1' } });
        }

        // 未登录，重定向到企业微信扫码页面
        const oauthUrl = buildWeComOAuthUrl(request);
        return Response.redirect(oauthUrl, 302);
    } catch (err) {
        console.error('Middleware Error:', err);
        return new Response('Internal Server Error', { status: 500 });
    }
}
