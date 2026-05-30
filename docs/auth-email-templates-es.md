# Templates de email de Auth en español (SIR V2)

> **Por qué este archivo:** los templates de email de Supabase Auth de este
> proyecto se gestionan **desde el Dashboard** (no hay `supabase/config.toml`
> en el repo). Este doc es la **fuente versionada**: editá acá y pegá en el
> Dashboard.
>
> **Dónde pegar:** Supabase Dashboard → **Authentication → Emails → Templates**.
> Cada template tiene su campo *Subject* y su cuerpo *HTML*.
>
> **Variables de Supabase** (no traducir, dejarlas literales): `{{ .ConfirmationURL }}`,
> `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .Email }}`.
>
> El proyecto usa **Google OAuth + Magic Link**. El template más importante es
> **Magic Link** (login passwordless); Google OAuth no envía emails. Los demás
> se incluyen para dejar todo en español de una.

---

## 1. Magic Link (el más usado)

**Subject:**
```
Tu acceso a SIR
```

**HTML:**
```html
<h2>Iniciá sesión en SIR</h2>
<p>Tocá el botón para entrar a tu Life OS. El enlace caduca en una hora y
   sirve una sola vez.</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:10px 18px;background:#0a0a0a;color:#f5f5f5;border-radius:8px;text-decoration:none;font-family:sans-serif">
    Entrar a SIR
  </a>
</p>
<p style="color:#888;font-size:13px">Si no pediste este acceso, ignorá este correo.</p>
```

---

## 2. Confirm signup (confirmar registro)

**Subject:**
```
Confirmá tu cuenta de SIR
```

**HTML:**
```html
<h2>Bienvenido a SIR</h2>
<p>Confirmá tu dirección de correo para activar tu cuenta:</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:10px 18px;background:#0a0a0a;color:#f5f5f5;border-radius:8px;text-decoration:none;font-family:sans-serif">
    Confirmar mi cuenta
  </a>
</p>
<p style="color:#888;font-size:13px">Si no creaste esta cuenta, ignorá este correo.</p>
```

---

## 3. Reset password (restablecer contraseña)

**Subject:**
```
Restablecer tu contraseña de SIR
```

**HTML:**
```html
<h2>Restablecer contraseña</h2>
<p>Pediste cambiar tu contraseña. Tocá el botón para elegir una nueva:</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:10px 18px;background:#0a0a0a;color:#f5f5f5;border-radius:8px;text-decoration:none;font-family:sans-serif">
    Cambiar contraseña
  </a>
</p>
<p style="color:#888;font-size:13px">Si no fuiste vos, ignorá este correo: tu contraseña queda igual.</p>
```

---

## 4. Change email address (cambio de correo)

**Subject:**
```
Confirmá tu nuevo correo en SIR
```

**HTML:**
```html
<h2>Confirmá tu nuevo correo</h2>
<p>Estás cambiando el correo de tu cuenta a <strong>{{ .Email }}</strong>.
   Confirmá para aplicar el cambio:</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:10px 18px;background:#0a0a0a;color:#f5f5f5;border-radius:8px;text-decoration:none;font-family:sans-serif">
    Confirmar nuevo correo
  </a>
</p>
<p style="color:#888;font-size:13px">Si no pediste este cambio, ignorá este correo.</p>
```

---

## 5. Invite user (invitación)

**Subject:**
```
Te invitaron a SIR
```

**HTML:**
```html
<h2>Te invitaron a SIR</h2>
<p>Alguien te invitó a SIR, tu Life Operating System. Aceptá la invitación
   para crear tu cuenta:</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:10px 18px;background:#0a0a0a;color:#f5f5f5;border-radius:8px;text-decoration:none;font-family:sans-serif">
    Aceptar invitación
  </a>
</p>
<p style="color:#888;font-size:13px">Si no esperabas esta invitación, ignorá este correo.</p>
```

---

## Opcional: SMTP propio (mejor entregabilidad)

El SMTP por defecto de Supabase está limitado (rate limits, puede caer en
spam). Para beta con familia conviene un SMTP propio gratis:

- **Resend** (gratis hasta ~3k emails/mes): Dashboard → Authentication →
  **SMTP Settings** → cargar host/usuario/clave de Resend + el remitente
  verificado (ej. `sir@tudominio`).

Esto es opcional y NO bloquea: con el SMTP default los emails ya salen en
español una vez pegados los templates de arriba.
