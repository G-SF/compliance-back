# Testando o Stripe localmente

## 1. Login no Stripe CLI (primeira vez)

```bash
npm run stripe:login
```

Isso abre o navegador para autenticar o CLI com sua conta Stripe.

## 2. Iniciar API + listener de webhooks juntos

```bash
npm run dev:stripe
```

Isso roda em paralelo:

- `API` → backend na porta 3000
- `STRIPE` → `stripe listen` encaminhando eventos para `localhost:3000/webhooks/stripe`

## 3. Copiar o webhook secret local

Após rodar `dev:stripe`, o Stripe CLI exibe:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxx (^C to quit)
```

Copie esse valor e cole no `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

> **Esse secret muda a cada vez** que você roda `stripe listen`.  
> Em produção o Railway já tem o `STRIPE_WEBHOOK_SECRET` fixo do Dashboard.

## 4. Price IDs de teste

Crie produtos/preços em modo teste no [Dashboard Stripe](https://dashboard.stripe.com/test/products).

Cada preço gerado tem um ID `price_test_...` — cole no `.env`:

```env
STRIPE_PRICE_BASIC=price_test_xxxBasico
STRIPE_PRICE_ESSENTIAL=price_test_xxxEssencial
STRIPE_PRICE_MONTHLY=price_test_xxxMensal
```

## 5. Disparar eventos manualmente

```bash
npm run stripe:trigger
```

Ou disparar outros eventos:

```bash
C:\Users\gabri\.stripe\stripe.exe trigger invoice.payment_succeeded
C:\Users\gabri\.stripe\stripe.exe trigger customer.subscription.updated
```

## 6. Cartão de teste Stripe

| Campo    | Valor                 |
| -------- | --------------------- |
| Número   | `4242 4242 4242 4242` |
| Validade | qualquer data futura  |
| CVC      | qualquer 3 dígitos    |
| CEP      | qualquer              |

Para simular falha: `4000 0000 0000 0002`
