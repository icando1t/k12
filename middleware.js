export const config = {
    // 匹配所有路由，排除静态资源（如 css、js、图片等）
    matcher: ['/((?!_next|.*\\..*).*)'],
};

export default function middleware(request) {
    const url = new URL(request.url);

    // 1. 获取用户输入的邀请码（通过 URL 参数 ?code=xxx 或 Cookie）
    const userCode = url.searchParams.get('code') || request.cookies.get('invite_code')?.value;

    // 2. 从环境变量读取正确的邀请码（默认为 my_secret_code）
    const VALID_CODE = process.env.INVITE_CODE || 'my_secret_code';

    // 3. 校验邀请码
    if (userCode === VALID_CODE) {
        // 验证成功，写 Cookie 避免用户重新输入
        const response = Response.next();
        response.headers.append('Set-Cookie', `invite_code=${userCode}; Path=/; HttpOnly; Max-Age=86400`);
        return response;
    }

    // 4. 未授权状态：返回访问限制页面
    return new Response(
        `<!DOCTYPE html>
    <html lang="zh-CN">
    <head><meta charset="UTF-8"><title>访问受限</title></head>
    <body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
      <form style="text-align:center;">
        <h3>请输入受邀访问码</h3>
        <input type="password" name="code" placeholder="输入邀请码" style="padding:8px;margin-bottom:10px;" required /><br/>
        <button type="submit" style="padding:8px 16px;">提交验证</button>
      </form>
    </body>
    </html>`,
        { headers: { 'Content-Type': 'text-html; charset=utf-8' }, status: 401 }
    );
}