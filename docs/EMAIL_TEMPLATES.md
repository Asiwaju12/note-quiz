# Recall Quiz authentication email templates

These templates are designed for Supabase Auth. They use Supabase's supported Go-template variables and a responsive, table-based layout that works in common email clients. They contain no external images, scripts, or tracking pixels.

## Important setup note

The Supabase project `note-quiz` was created on the Free plan after 3 June 2026. Supabase's default SMTP service does not allow custom authentication templates for new Free projects. Configure a custom SMTP provider first (Resend is the preferred option for this project), then paste each HTML template into **Supabase → Authentication → Email Templates**.

Resend SMTP settings:
- Host: `smtp.resend.com`
- Port: `465` (SSL) or `587` (STARTTLS)
- Username: `resend`
- Password: your Resend API key (keep it private; never put it in GitHub or the browser)
- Sender: a verified address on a domain you own, for example `Recall Quiz <no-reply@your-verified-domain>`

A verified sending domain is required for sending to users generally. The Vercel app URL is not an email-sending domain. Set SMTP credentials in Supabase's Auth SMTP settings, not in Vercel environment variables.

## 1. Confirm sign up

**Subject:** Confirm your Recall Quiz account

Paste the following into the Confirm signup template:

```html
<div style="margin:0;padding:36px 12px;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e9f0;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:28px 36px 20px;text-align:center;background:#17152b;">
      <div style="font-size:13px;letter-spacing:2px;font-weight:700;color:#c8baff;">RECALL QUIZ</div>
      <div style="margin-top:12px;font-size:25px;line-height:1.25;font-weight:700;color:#ffffff;">Learn smarter. Remember more.</div>
    </td></tr>
    <tr><td style="padding:36px;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#4b5568;">Hello,</p>
      <h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#17152b;">Confirm your email address</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5568;">Thank you for creating a Recall Quiz account. Please confirm this email address to activate your account and keep your study materials and progress connected.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td align="center" bgcolor="#7357d9" style="border-radius:9px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Confirm email address</a>
      </td></tr></table>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#687286;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#7357d9;">{{ .ConfirmationURL }}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#687286;">If you did not create a Recall Quiz account, you can safely ignore this email.</p>
    </td></tr>
    <tr><td style="padding:20px 36px;background:#f8f8fb;border-top:1px solid #eceef3;text-align:center;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#81899a;">Recall Quiz · Your personal study companion</p>
      <p style="margin:6px 0 0;font-size:11px;color:#9aa1af;">This is an automated account email. Please do not reply.</p>
    </td></tr>
  </table>
</div>
```

## 2. Reset password

**Subject:** Reset your Recall Quiz password

Paste the following into the Reset password template:

```html
<div style="margin:0;padding:36px 12px;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e9f0;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:28px 36px 20px;text-align:center;background:#17152b;">
      <div style="font-size:13px;letter-spacing:2px;font-weight:700;color:#c8baff;">RECALL QUIZ</div>
      <div style="margin-top:12px;font-size:25px;line-height:1.25;font-weight:700;color:#ffffff;">Your learning journey matters.</div>
    </td></tr>
    <tr><td style="padding:36px;">
      <h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#17152b;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5568;">We received a request to reset the password for your Recall Quiz account. Use the secure button below to choose a new password.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td align="center" bgcolor="#7357d9" style="border-radius:9px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Reset my password</a>
      </td></tr></table>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#687286;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#7357d9;">{{ .ConfirmationURL }}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#687286;">If you did not request a password reset, no action is needed. Your password will remain unchanged.</p>
    </td></tr>
    <tr><td style="padding:20px 36px;background:#f8f8fb;border-top:1px solid #eceef3;text-align:center;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#81899a;">Recall Quiz · Your personal study companion</p>
      <p style="margin:6px 0 0;font-size:11px;color:#9aa1af;">For your security, never share password-reset links or verification codes.</p>
    </td></tr>
  </table>
</div>
```

## 3. Magic link / passwordless sign-in

**Subject:** Your secure sign-in link for Recall Quiz

Paste the following into the Magic link template:

```html
<div style="margin:0;padding:36px 12px;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e9f0;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:28px 36px;text-align:center;background:#17152b;">
      <div style="font-size:13px;letter-spacing:2px;font-weight:700;color:#c8baff;">RECALL QUIZ</div>
      <div style="margin-top:12px;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;">Welcome back.</div>
    </td></tr>
    <tr><td style="padding:36px;">
      <h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#17152b;">Sign in to Recall Quiz</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5568;">Use the secure link below to access your account, study materials and saved learning progress.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td align="center" bgcolor="#7357d9" style="border-radius:9px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Sign in securely</a>
      </td></tr></table>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#687286;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#7357d9;">{{ .ConfirmationURL }}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#687286;">This sign-in link is private and can only be used once. If you did not request it, you can ignore this email.</p>
    </td></tr>
    <tr><td style="padding:20px 36px;background:#f8f8fb;border-top:1px solid #eceef3;text-align:center;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#81899a;">Recall Quiz · Your personal study companion</p>
      <p style="margin:6px 0 0;font-size:11px;color:#9aa1af;">This is an automated account email. Please do not reply.</p>
    </td></tr>
  </table>
</div>
```

## 4. Change email address

**Subject:** Confirm your new Recall Quiz email address

Paste the following into the Change email address template:

```html
<div style="margin:0;padding:36px 12px;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e9f0;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:28px 36px;text-align:center;background:#17152b;">
      <div style="font-size:13px;letter-spacing:2px;font-weight:700;color:#c8baff;">RECALL QUIZ</div>
      <div style="margin-top:12px;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;">Account security update</div>
    </td></tr>
    <tr><td style="padding:36px;">
      <h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#17152b;">Confirm your new email address</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5568;">A request was made to change the email address on your Recall Quiz account to <strong>{{ .NewEmail }}</strong>. Confirm the new address using the secure button below.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td align="center" bgcolor="#7357d9" style="border-radius:9px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Confirm new email</a>
      </td></tr></table>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#687286;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#7357d9;">{{ .ConfirmationURL }}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#687286;">If you did not request this change, do not confirm it. Your current email address will remain associated with your account.</p>
    </td></tr>
    <tr><td style="padding:20px 36px;background:#f8f8fb;border-top:1px solid #eceef3;text-align:center;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#81899a;">Recall Quiz · Your personal study companion</p>
      <p style="margin:6px 0 0;font-size:11px;color:#9aa1af;">This is an automated account email. Please do not reply.</p>
    </td></tr>
  </table>
</div>
```

## 5. Recommended security notifications

Enable the Supabase notifications for password changes and email-address changes. Keep their messages factual and include a clear instruction to contact support if the change was not authorised. Do not include passwords, API keys, or other secrets in any email.
