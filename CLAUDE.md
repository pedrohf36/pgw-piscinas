# PGW Piscinas — contexto permanente do projeto

Site estático de captação de leads (uma página). Sem build, sem framework.

```
index.html          estrutura + conteúdo (é o que o Google indexa)
assets/styles.css   design system (tokens em :root)
assets/app.js       configuração central + toda a lógica
assets/favicon.svg
uploads/            fotos das piscinas
```

Rodar local: `py -3 -m http.server 5173` na raiz do projeto
(ou o preview `pgw-piscinas` em `../.claude/launch.json`).

## Deploy

- **Site ao vivo:** https://pedrohf36.github.io/pgw-piscinas/
- **Repositório:** https://github.com/pedrohf36/pgw-piscinas (público)
- **Publicação:** GitHub Pages, branch `main`, raiz do repo. Todo `git push`
  para `main` republica o site automaticamente (leva ~1 min).
- Sem custo, sem build step — GitHub Pages serve os arquivos estáticos como
  estão.

### Fluxo de trabalho neste chat

A cada mudança feita aqui, o commit e o push para `main` são automáticos —
não é preciso pedir a cada vez. Isso publica a mudança no site ao vivo em
seguida. Se algo não deveria ir ao ar ainda, avise antes da mudança.

## Configuração central

**Todo dado comercial vive no objeto `business`, no topo de `assets/app.js`.**
Nada de número, horário ou preço espalhado pelo HTML. O HTML traz o texto certo
para SEO/no-JS; o `app.js` reinjeta nos pontos marcados com `data-business="…"`.

| Campo | Valor atual |
|---|---|
| `name` | PGW Piscinas |
| `whatsapp` | `5519981430763` |
| `whatsappDisplay` | +55 19 98143-0763 |
| `horario` | Segunda a sexta-feira, das 08:00 às 18:00 |
| `area` | Campinas e região |
| `cities` | `[]` — vazio de propósito (ver regra 5) |
| `pricing.per1000Liters` | 12 |
| `pricing.minimumPrice` | 250 |
| `leadEndpoint` | `""` — sem backend ainda |
| `website.url` | `""` — sem domínio ainda |

### Unidade de preço — atenção
`per1000Liters` é **reais por 1.000 litros (R$/m³)**, não por mililitro.
O alias `perMilLiters` existe só para compatibilidade e carrega o mesmo valor.

```
estimativa = MAX(litros / 1000 × per1000Liters × freqFactor × treatFactor, minimumPrice)
```

Referência Campinas/SP 2026: manutenção residencial semanal R$300–800/mês.
Com R$12/1.000 L no padrão (semanal + cloro): 30.000 L → R$360, 50.000 L → R$600.
`freqFactor` (semanal 1 · quinzenal 0,62 · mensal 0,38) e `treatFactor`
(cloro 1 · sal 1,12) ajustam a partir dessa base.

## Regras herdadas do briefing

1. **Nenhum dado inventado.** CNPJ, e-mail, endereço, depoimentos, notas e
   contadores só entram quando vierem do cliente.
2. **Fonte única de dados:** o objeto `business`.
3. Laranja `#C2500A` é exclusivo de CTA primário. Verde `#12784A` =
   confirmação/WhatsApp.
4. A calculadora **nunca** apresenta o valor como preço final — é estimativa,
   sempre com a ressalva de que o valor sai após a vistoria.
5. **Cidades só entram com conteúdo próprio.** `business.cities` está vazio de
   propósito: publicar nome de cidade sem bairros nomeados, fator técnico local
   e caso real vira doorway page e o Google penaliza. Preenchendo o array, a
   seção "Onde atendemos" renderiza os chips sozinha.
6. **O formulário não finge envio.** Sem `leadEndpoint`, ele valida e entrega o
   lead pelo WhatsApp (painel `data-form="handoff"`). O painel "Recebemos seu
   pedido" só aparece quando um POST real retorna OK.

## Design system

- Paleta: `#06283B` (tinta), `#0C425F`, `#0B6E9E` (azul), `#3FBFD8` (cristal),
  `#F2F8FB` (superfície), `#12784A` (verde), `#C2500A` (CTA laranja).
- Tipografia: Sora (títulos/UI) + IBM Plex Sans (texto).
- Elemento-assinatura: gradiente água-verde → cristalina
  (`#6E8F3A → #2FA9A0 → #3FBFD8`), em divisores, marcadores de card e logo.

## Campanhas

`?intent=recorrencia` e `?intent=projeto` trocam headline, subtítulo, CTA e a
mensagem do WhatsApp no cliente — um grupo de anúncio por intenção, sem criar
página duplicada. O HTML nasce com a variante `emergencia`, que é a indexada.

## Ativar quando os dados chegarem

| Para ativar | Onde |
|---|---|
| Domínio (canonical, og:url, og:image) | `business.website.url` em `app.js` |
| Envio do formulário para CRM/webhook | `business.leadEndpoint` em `app.js` |
| Cidades e bairros atendidos | `business.cities` em `app.js` |
| GA4 / Google Ads | bloco comentado no `<head>` do `index.html` |
| CNPJ, política de privacidade, termos | rodapé do `index.html` |
| `address` no schema LocalBusiness | JSON-LD no `<head>` |

Eventos de analytics já disparam via `gtag` quando o GA4 for colado:
`whatsapp_click`, `form_submit`, `calculator_complete`.

## Cache de assets

`index.html` referencia `styles.css?v=N` e `app.js?v=N`. **Suba o `N` a cada
deploy**, senão o navegador serve o arquivo antigo.

## Pendência conhecida

`uploads/piscina1.jpg`, `piscina3.jpg` e `piscina4.jpg` vieram truncados do
import (limite de transferência de 192 KiB) e estão sem o marcador final de
JPEG. Renderizam, mas devem ser substituídos pelos originais.
