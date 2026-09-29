export const config = {
    // 匹配所有路径，过滤静态资源
    matcher: ['/((?!_next|.*\\..*).*)'],
};

// 辅助函数：安全解析 Cookie
function getCookie(request, name) {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp(`(?:^|; )` + name + `=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

export default function middleware(request) {
    try {
        // 1. 安全解析 URL
        const url = new URL(request.url);

        // 2. 从 URL 参数或 Cookie 中提取用户提供的验证码
        const paramCode = url.searchParams.get('code');
        const cookieCode = getCookie(request, 'invite_code');
        const userCode = paramCode || cookieCode;

        // 3. 获取预设的访问密码（环境变量或默认值）
        const VALID_CODE = process.env.INVITE_CODE || 'my_secret_code';

        // 4. 校验密码
        if (userCode === VALID_CODE) {
            // 验证通过，放行请求，并写入/更新 Cookie
            const response = new Response(null, {
                headers: {
                    'x-middleware-next': '1', // 告知 Vercel 继续渲染后续网页内容
                },
            });
            // 设置 Cookie 过期时间为 1 天
            response.headers.append('Set-Cookie', `invite_code=${userCode}; Path=/; HttpOnly; Max-Age=86400`);
            return response;
        }

        // 5. 验证失败：返回拦截 HTML 页面
        return new Response(
            `<!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>访问受控</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f7f9fa;">
        <form style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 300px; width: 100%;">
          <h3 style="margin-top: 0; color: #333;">受邀人员访问验证</h3>
          <input type="password" name="code" placeholder="请输入受邀访问码" style="width: 100%; padding: 10px; margin: 15px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;" required />
          <button type="submit" style="width: 100%; padding: 10px; background-color: #0070f3; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">验证并进入</button>
        </form>
      </body>
      </html>`,
            {
                status: 401,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
        );
    } catch (err) {
        // 捕获异常，避免触发崩溃报错
        console.error('Middleware Error:', err);
        return new Response('Internal Server Error', { status: 500 });
    }
}