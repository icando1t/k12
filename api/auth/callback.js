import { SignJWT } from 'jose';

// 获取企业微信 access_token
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

// 用 code 换取用户信息
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

// 生成 JWT
async function generateToken(userId) {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default_jwt_secret');

    const jwt = await new SignJWT({ userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('24h')
        .setIssuedAt()
        .sign(secret);

    return jwt;
}

export default async function handler(req, res) {
    try {
        const url = new URL(req.url, `https://${req.headers.host}`);
        const code = url.searchParams.get('code');

        if (!code) {
            return res.status(400).send('缺少授权 code');
        }

        // 检查环境变量
        if (!process.env.WECOM_CORP_ID || !process.env.WECOM_SECRET) {
            throw new Error('缺少 WECOM_CORP_ID 或 WECOM_SECRET 环境变量');
        }

        // 1. 获取 access_token
        const accessToken = await getAccessToken();

        // 2. 获取用户信息
        const userInfo = await getUserInfo(accessToken, code);

        if (!userInfo.userId) {
            return res.status(401).send('未授权用户');
        }

        // 3. 生成 JWT
        const token = await generateToken(userInfo.userId);

        // 4. 设置 cookie 并重定向
        res.setHeader(
            'Set-Cookie',
            `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        );
        res.redirect(302, '/');
    } catch (err) {
        console.error('Auth Callback Error:', err);
        res.status(500).send(`认证失败: ${err.message}`);
    }
}
