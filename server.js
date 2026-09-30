import express from 'express';
import { jwtVerify, SignJWT } from 'jose';

const app = express();
const PORT = process.env.PORT || 3000;

// ─── 辅助函数 ───

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp(`(?:^|; )` + name + `=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

async function verifySession(req) {
    const token = getCookie(req, 'session');
    if (!token) return false;

    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default_jwt_secret');
        await jwtVerify(token, secret);
        return true;
    } catch {
        return false;
    }
}

function buildWeComOAuthUrl(req) {
    const corpId = process.env.WECOM_CORP_ID;
    const agentId = process.env.WECOM_AGENT_ID;
    const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = encodeURIComponent(`${siteUrl}/api/auth/callback`);

    return `https://login.work.weixin.qq.com/wwlogin/sso/login?login_type=CorpApp&appid=${corpId}&agentid=${agentId}&redirect_uri=${redirectUri}`;
}

// ─── 企业微信 OAuth 回调 ───

async function getAccessToken() {
    const corpId = process.env.WECOM_CORP_ID;
    const secret = process.env.WECOM_SECRET;

    const res = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`
    );
    const data = await res.json();

    if (data.errcode !== 0) {
        throw new Error(`获取 access_token 失败: ${data.errmsg}`);
    }

    return data.access_token;
}

async function getUserInfo(accessToken, code) {
    const res = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`
    );
    const data = await res.json();

    if (data.errcode !== 0) {
        throw new Error(`获取用户信息失败: ${data.errmsg}`);
    }

    return {
        userId: data.userid || data.UserId,
        deviceId: data.DeviceId,
    };
}

async function generateToken(userId) {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default_jwt_secret');

    const jwt = await new SignJWT({ userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('24h')
        .setIssuedAt()
        .sign(secret);

    return jwt;
}

// ─── 路由 ───

// API: 企业微信 OAuth 回调
app.get('/api/auth/callback', async (req, res) => {
    try {
        const code = req.query.code;

        if (!code) {
            return res.status(400).send('缺少授权 code');
        }

        if (!process.env.WECOM_CORP_ID || !process.env.WECOM_SECRET) {
            throw new Error('缺少 WECOM_CORP_ID 或 WECOM_SECRET 环境变量');
        }

        const accessToken = await getAccessToken();
        const userInfo = await getUserInfo(accessToken, code);

        if (!userInfo.userId) {
            return res.status(401).send('未授权用户');
        }

        const token = await generateToken(userInfo.userId);

        res.setHeader(
            'Set-Cookie',
            `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
        );
        res.redirect(302, '/');
    } catch (err) {
        console.error('Auth Callback Error:', err);
        res.status(500).send(`认证失败: ${err.message}`);
    }
});

// 认证中间件：保护静态页面
app.use(async (req, res, next) => {
    try {
        const isValid = await verifySession(req);

        if (isValid) {
            return next();
        }

        // 未登录，重定向到企业微信扫码
        const oauthUrl = buildWeComOAuthUrl(req);
        return res.redirect(302, oauthUrl);
    } catch (err) {
        console.error('Auth Middleware Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// 静态文件
app.use(express.static('public'));

// ─── 启动 ───

app.listen(PORT, () => {
    console.log(`K12 Dashboard running at http://localhost:${PORT}`);
});
