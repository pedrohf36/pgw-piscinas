/* ============================================================
   PGW Piscinas — lógica do site
   ============================================================ */
(function () {
  "use strict";

  /* ==========================================================
     CONFIGURAÇÃO CENTRAL — única fonte de dados comerciais.
     Trocar aqui atualiza todo o site: links de WhatsApp,
     calculadora, horário, área de atendimento e SEO.
     Não repita nenhum destes valores no HTML nem no CSS.
     ========================================================== */
  var business = {
    name: "PGW Piscinas",

    // WhatsApp em formato internacional, só dígitos.
    whatsapp: "5519981430763",
    // Como o número aparece para o visitante.
    whatsappDisplay: "+55 19 98143-0763",

    horario: "Segunda a sexta-feira, das 08:00 às 18:00",

    // Área de atendimento. cities/bairros ficam vazios de propósito:
    // publicar nome de cidade sem conteúdo próprio vira doorway page.
    // Quando a lista fechada chegar, basta preencher `cities` — a seção
    // "Onde atendemos" passa a renderizar os itens automaticamente.
    area: "Campinas e região",
    areaShort: "Campinas/SP",
    cities: [],

    /* ------------------------------------------------------
       PREÇOS DA CALCULADORA
       ATENÇÃO À UNIDADE: per1000Liters é REAIS POR 1.000 LITROS
       (R$/m³), NÃO por mililitro. Referência Campinas/SP 2026.

         estimativa = MAX(litros / 1000 * per1000Liters, minimumPrice)

       Ex.: 30.000 L → 30 × R$12 = R$360
            10.000 L → 10 × R$12 = R$120 → piso R$250
       ------------------------------------------------------ */
    pricing: {
      per1000Liters: 12,
      minimumPrice: 250,

      // Alias legado — mesma unidade (R$/1.000 L). Mantido para não
      // quebrar integrações que ainda leiam o nome antigo.
      perMilLiters: 12,

      // Ajuste por rotina. `semanal` é a base das referências acima.
      freqFactor:  { semanal: 1, quinzenal: 0.62, mensal: 0.38 },
      treatFactor: { cloro: 1, sal: 1.12 },

      // Limites sãos para as medidas informadas (metros).
      bounds: { length: [1, 50], width: [1, 25], depth: [0.5, 5] }
    },

    /* ------------------------------------------------------
       Destino do lead do formulário.
       Vazio = ainda não existe backend. Nesse caso o formulário
       NÃO finge sucesso: ele valida, monta a mensagem e entrega
       o lead pelo WhatsApp. Para ativar um endpoint depois, basta
       preencher esta string — nenhum outro arquivo muda.
       ------------------------------------------------------ */
    leadEndpoint: "",

    /* ------------------------------------------------------
       Domínio final. Vazio = sem deploy ainda.
       Enquanto estiver vazio NÃO geramos canonical, og:url nem
       og:image absoluta — canonical apontando para domínio errado
       é pior do que canonical nenhuma.
       ------------------------------------------------------ */
    website: {
      url: "",
      ogImage: "uploads/piscina1.jpg"
    }
  };

  /* ==========================================================
     Variantes de headline por intenção de campanha.
     A página nasce com "emergencia" no HTML (é o que o Google indexa).
     ?intent=recorrencia  ou  ?intent=projeto  troca a copy no cliente,
     para separar grupos de anúncio sem criar doorway pages.
     ========================================================== */
  var HERO = {
    emergencia: {
      badge: "Atendimento em " + business.area,
      title: "Piscina verde hoje, água cristalina antes do fim de semana",
      sub:   "Choque de cloro calculado pelo volume real da sua piscina, aspiração e filtragem acompanhada. Você manda uma foto da água; a gente já diz o que ela precisa.",
      cta:   "Chamar no WhatsApp agora",
      msg:   "Olá! Minha piscina está com a água ruim e preciso de atendimento. Pode me ajudar?"
    },
    recorrencia: {
      badge: "Planos mensais com produtos inclusos",
      title: "Alguém cuidando da sua piscina toda semana, sem você lembrar",
      sub:   "Visita fixa, dosagem medida e leitura de pH e cloro registrada a cada atendimento. Valor mensal definido pelo volume da piscina, não por estimativa de olho.",
      cta:   "Quero um plano mensal",
      msg:   "Olá! Quero contratar manutenção mensal da minha piscina. Pode me passar as opções?"
    },
    projeto: {
      badge: "Reforma, aquecimento e automação",
      title: "Da reforma ao aquecimento, com projeto antes do orçamento",
      sub:   "Vistoria técnica, dimensionamento e execução com acabamento. Você aprova escopo e prazo por escrito antes de qualquer serviço começar.",
      cta:   "Falar sobre meu projeto",
      msg:   "Olá! Tenho um projeto de reforma/aquecimento de piscina e quero conversar."
    }
  };

  var FREQ_LABEL  = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" };
  var TREAT_LABEL = { cloro: "Cloro", sal: "Sistema de sal" };

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==========================================================
     Formatação
     ========================================================== */
  function fmtInt(n) {
    if (!isFinite(n)) return "0";
    return Math.round(n).toLocaleString("pt-BR");
  }

  function brl(n) {
    if (!isFinite(n)) n = 0;
    return Math.round(n).toLocaleString("pt-BR", {
      style: "currency", currency: "BRL", maximumFractionDigits: 0
    });
  }

  /* Lê um input numérico com tolerância a vírgula, vazio e lixo. */
  function readNumber(el, min, max, fallback) {
    var raw = String(el.value == null ? "" : el.value).trim().replace(",", ".");
    var n = parseFloat(raw);
    if (!isFinite(n)) return fallback;      // vazio, "abc", "--"
    if (n <= 0) return min;                 // zero e negativos
    return Math.min(Math.max(n, min), max); // clamp nos dois extremos
  }

  /* ==========================================================
     WhatsApp + analytics
     ========================================================== */
  function waLink(msg) {
    var n = String(business.whatsapp || "").replace(/\D/g, "");
    if (!n) return "#orcamento"; // sem número configurado, cai no formulário
    return "https://wa.me/" + n + (msg ? "?text=" + encodeURIComponent(msg) : "");
  }

  function track(name, extra) {
    if (typeof window.gtag === "function") window.gtag("event", name, extra || {});
  }

  /* Aplica href de WhatsApp + evento de analytics em um elemento. */
  function bindWa(el, msg, secao) {
    if (!el) return;
    el.setAttribute("href", waLink(msg));
    if (business.whatsapp) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    }
    if (!el.dataset.waBound) {
      el.dataset.waBound = "1";
      el.addEventListener("click", function () {
        track("whatsapp_click", { secao: secao });
      });
    }
  }

  /* ==========================================================
     Injeta os dados centrais nos pontos marcados do HTML.
     O HTML já traz o texto correto para SEO e no-JS; isto apenas
     garante que tudo siga a configuração se ela mudar.
     ========================================================== */
  function initBusinessData() {
    var values = {
      name: business.name,
      horario: business.horario,
      area: business.area,
      "area-short": business.areaShort,
      whatsapp: business.whatsappDisplay
    };
    $$("[data-business]").forEach(function (el) {
      var key = el.dataset.business;
      if (values[key]) el.textContent = values[key];
    });

    // Link direto do footer para o WhatsApp
    bindWa($('[data-wa="footer"]'),
      "Olá! Vim pelo site da " + business.name + " e quero falar sobre minha piscina.",
      "footer");

    // Lista de cidades — só renderiza quando existir lista real.
    var cityList = $("[data-city-list]");
    if (cityList && business.cities.length) {
      cityList.innerHTML = "";
      business.cities.forEach(function (c) {
        var li = document.createElement("li");
        li.className = "area__city";
        li.textContent = c;
        cityList.appendChild(li);
      });
      cityList.hidden = false;
    }
  }

  /* ==========================================================
     SEO dependente de domínio — só quando business.website.url
     estiver preenchido. Sem domínio, nenhuma URL é inventada.
     ========================================================== */
  function initSeo() {
    var base = String(business.website.url || "").trim().replace(/\/+$/, "");
    if (!base) return;

    var canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    canonical.setAttribute("href", base + "/");
    document.head.appendChild(canonical);

    function meta(attr, key, value) {
      var el = document.head.querySelector("meta[" + attr + '="' + key + '"]');
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    }

    meta("property", "og:url", base + "/");
    if (business.website.ogImage) {
      var img = base + "/" + String(business.website.ogImage).replace(/^\/+/, "");
      meta("property", "og:image", img);
      meta("name", "twitter:image", img);
    }
  }

  /* ==========================================================
     Hero por intenção
     ========================================================== */
  function initHero() {
    var intent = new URLSearchParams(window.location.search).get("intent");
    var copy = HERO[intent] || HERO.emergencia;

    var map = { badge: copy.badge, title: copy.title, sub: copy.sub, cta: copy.cta };
    Object.keys(map).forEach(function (k) {
      var el = $('[data-hero="' + k + '"]');
      if (el) el.textContent = map[k];
    });

    bindWa($('[data-wa="hero"]'), copy.msg, "hero");
  }

  /* ==========================================================
     Links de WhatsApp estáticos (serviços, CTA final, flutuante)
     ========================================================== */
  function initStaticWa() {
    $$("[data-wa-msg]").forEach(function (el) {
      if (el.dataset.wa === "hero") return; // tratado em initHero
      var secao = el.dataset.wa === "servico"
        ? "servico:" + el.dataset.waService
        : el.dataset.wa;
      bindWa(el, el.dataset.waMsg, secao);
    });
  }

  /* ==========================================================
     Calculadora de estimativa
     ========================================================== */
  function initCalculator() {
    var lengthEl = $("#calc-length");
    var widthEl  = $("#calc-width");
    var depthEl  = $("#calc-depth");
    if (!lengthEl || !widthEl || !depthEl) return;

    var b = business.pricing.bounds;
    var state = { freq: "semanal", treat: "cloro" };

    var out = {
      volume:     $('[data-calc="volume"]'),
      dims:       $('[data-calc="dims"]'),
      freq:       $('[data-calc="freq"]'),
      treat:      $('[data-calc="treat"]'),
      price:      $('[data-calc="price"]'),
      priceValue: $('[data-calc="price-value"]')
    };
    var ctaCalc = $('[data-wa="calculadora"]');

    function dims() {
      return {
        L: readNumber(lengthEl, b.length[0], b.length[1], b.length[0]),
        W: readNumber(widthEl,  b.width[0],  b.width[1],  b.width[0]),
        D: readNumber(depthEl,  b.depth[0],  b.depth[1],  b.depth[0])
      };
    }

    function volume(d) {
      var v = d.L * d.W * d.D * 1000;
      return isFinite(v) && v > 0 ? Math.round(v) : 0;
    }

    /* estimativa = MAX(litros/1000 × R$/1.000L × fatores, piso) */
    function estimate(vol) {
      var p = business.pricing;
      var rate = p.per1000Liters || p.perMilLiters;
      if (!rate || !vol) return null;

      var base = (vol / 1000) * rate
               * (p.freqFactor[state.freq] || 1)
               * (p.treatFactor[state.treat] || 1);

      if (!isFinite(base) || base < 0) return null;
      return Math.max(base, p.minimumPrice || 0);
    }

    /* Número "bonito" para a mensagem: 1.4 vira "1,4", 4 vira "4". */
    function num(n) {
      return Number(n.toFixed(2)).toLocaleString("pt-BR");
    }

    function render() {
      var d = dims();
      var vol = volume(d);
      var freqLabel  = FREQ_LABEL[state.freq];
      var treatLabel = TREAT_LABEL[state.treat];

      out.volume.textContent = fmtInt(vol);
      out.dims.textContent   = num(d.L) + " × " + num(d.W) + " × " + num(d.D) + " m";
      out.freq.textContent   = freqLabel;
      out.treat.textContent  = treatLabel;

      var price = estimate(vol);
      var priceText = "";
      if (price != null) {
        priceText = brl(price);
        out.priceValue.textContent = priceText;
        out.price.hidden = false;
      } else {
        out.price.hidden = true;
      }

      var msg = "Olá! Usei a calculadora do site da " + business.name +
        " e gostaria de solicitar um orçamento. Minha piscina tem cerca de " +
        num(d.L) + "m × " + num(d.W) + "m, profundidade média " + num(d.D) +
        "m (~" + fmtInt(vol) + " litros), com manutenção " + freqLabel.toLowerCase() +
        " e tratamento " + treatLabel.toLowerCase() + "." +
        (priceText ? " A estimativa do site foi de " + priceText + " por mês." : "");

      if (ctaCalc) bindWa(ctaCalc, msg, "calculadora");
    }

    [lengthEl, widthEl, depthEl].forEach(function (el) {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
      // Ao sair do campo, mostra o valor realmente usado no cálculo — assim
      // o visitante não fica achando que "999" foi aceito como comprimento.
      el.addEventListener("blur", function () {
        var key = el === lengthEl ? "length" : (el === widthEl ? "width" : "depth");
        var range = b[key];
        el.value = num(readNumber(el, range[0], range[1], range[0]));
        render();
      });
    });

    function bindPills(attr, key) {
      var pills = $$("[data-" + attr + "]");
      pills.forEach(function (btn) {
        btn.addEventListener("click", function () {
          state[key] = btn.dataset[attr];
          pills.forEach(function (other) {
            var on = other === btn;
            other.classList.toggle("is-active", on);
            other.setAttribute("aria-checked", on ? "true" : "false");
          });
          render();
        });
      });
    }
    bindPills("freq", "freq");
    bindPills("treat", "treat");

    if (ctaCalc) {
      ctaCalc.addEventListener("click", function () {
        var vol = volume(dims());
        track("calculator_complete", {
          litros: vol,
          estimativa: estimate(vol),
          frequencia: state.freq,
          tratamento: state.treat
        });
      });
    }

    render();
  }

  /* ==========================================================
     FAQ — um aberto por vez, como no design
     ========================================================== */
  function initFaq() {
    var items = $$(".faq__item");
    items.forEach(function (item) {
      var btn = $(".faq__q", item);
      if (!btn) return;
      btn.addEventListener("click", function () {
        var willOpen = !item.classList.contains("is-open");
        items.forEach(function (other) {
          other.classList.remove("is-open");
          var q = $(".faq__q", other);
          if (q) q.setAttribute("aria-expanded", "false");
        });
        if (willOpen) {
          item.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  /* ==========================================================
     Lightbox da galeria
     ========================================================== */
  function initLightbox() {
    var root = $("[data-lightbox-root]");
    if (!root) return;
    var img = $(".lightbox__img", root);
    var closeBtn = $(".lightbox__close", root);
    var lastFocus = null;

    function open(src, alt) {
      lastFocus = document.activeElement;
      img.setAttribute("src", src);
      img.setAttribute("alt", alt || "Foto ampliada de piscina atendida pela PGW Piscinas");
      root.hidden = false;
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }

    function close() {
      root.hidden = true;
      img.removeAttribute("src");
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    }

    $$("[data-lightbox]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pic = $("img", btn);
        open(btn.dataset.lightbox, pic ? pic.alt : "");
      });
    });

    root.addEventListener("click", function (e) {
      if (e.target === root || e.target === closeBtn || e.target === img) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !root.hidden) close();
    });
  }

  /* ==========================================================
     Formulário de orçamento
     ========================================================== */
  function maskPhone(v) {
    var d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2)  return d.length ? "(" + d : "";
    if (d.length <= 6)  return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }

  function initForm() {
    var form = $('[data-form="quote"]');
    if (!form) return;

    var success  = $('[data-form="success"]');
    var handoff  = $('[data-form="handoff"]');
    var errorBox = $('[data-form="error"]');
    var submitBtn = $('button[type="submit"]', form);
    var submitLabel = submitBtn ? submitBtn.textContent : "";
    var phone = form.elements.phone;
    var sending = false;

    phone.addEventListener("input", function () {
      var atEnd = phone.selectionStart === phone.value.length;
      phone.value = maskPhone(phone.value);
      if (atEnd) phone.setSelectionRange(phone.value.length, phone.value.length);
    });

    function fail(msg, field) {
      errorBox.textContent = msg;
      errorBox.hidden = false;
      if (field) field.focus();
      return false;
    }

    function setSending(on) {
      sending = on;
      if (!submitBtn) return;
      submitBtn.disabled = on;
      submitBtn.textContent = on ? "Enviando…" : submitLabel;
      submitBtn.setAttribute("aria-busy", on ? "true" : "false");
    }

    function showPanel(el, data) {
      form.hidden = true;
      el.hidden = false;
      el.setAttribute("tabindex", "-1");
      el.focus();

      bindWa($('[data-wa="form-sucesso"]', el),
        "Olá! Sou " + data.name + ", de " + data.city + ". " +
        "Gostaria de solicitar um orçamento para: " + data.service + ". " +
        "Meu WhatsApp é " + data.phoneMasked + ".",
        "form-" + (el === handoff ? "handoff" : "sucesso"));
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return; // trava duplo envio

      var name    = form.elements.name.value.trim();
      var masked  = form.elements.phone.value;
      var digits  = masked.replace(/\D/g, "");
      var ddd     = parseInt(digits.slice(0, 2), 10);
      var city    = form.elements.city.value.trim();
      var service = form.elements.service.value;
      var consent = form.elements.consent.checked;

      // honeypot: robô preencheu o campo escondido — descarta em silêncio
      if (form.elements.website.value) return;

      if (name.length < 2) return fail("Escreva seu nome para a gente saber como te chamar.", form.elements.name);
      if (digits.length < 10 || digits.length > 11 || !(ddd >= 11 && ddd <= 99)) {
        return fail("Confira o WhatsApp: precisa de DDD + número, ex. (19) 91234-5678.", form.elements.phone);
      }
      if (!city) return fail("Informe a cidade ou o bairro da piscina.", form.elements.city);
      if (!consent) return fail("Marque a autorização de contato para podermos responder.", form.elements.consent);

      errorBox.hidden = true;
      var data = { name: name, phone: digits, phoneMasked: masked, city: city, service: service };
      track("form_submit", { servico: service, cidade: city });

      // Sem endpoint configurado não existe envio: entregamos o lead pelo
      // WhatsApp em vez de fingir que uma API recebeu os dados.
      if (!business.leadEndpoint) {
        showPanel(handoff || success, data);
        return;
      }

      setSending(true);
      fetch(business.leadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          setSending(false);
          showPanel(success, data);
        })
        .catch(function () {
          setSending(false);
          fail("Não conseguimos enviar agora. Tente de novo ou fale direto no WhatsApp — respondemos por lá.");
          bindWa($('[data-wa="form-erro"]'),
            "Olá! Tentei enviar o formulário do site e não funcionou. Sou " + name +
            ", de " + city + ", e quero falar sobre: " + service + ".",
            "form-erro");
          var fallback = $('[data-form="error-wa"]');
          if (fallback) fallback.hidden = false;
        });
    });
  }

  /* ==========================================================
     Menu mobile — navegação por categoria
     ========================================================== */
  function initMobileMenu() {
    var toggle = $(".nav-toggle");
    var menu = $("#menu-mobile");
    if (!toggle || !menu) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Fechar menu de navegação" : "Abrir menu de navegação");
      menu.hidden = !open;
      menu.classList.toggle("is-open", open);
      document.body.style.overflow = open ? "hidden" : "";
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Fecha ao escolher uma seção
    $$("a", menu).forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    // Se a tela crescer, o menu de desktop volta e este fecha
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1040 && toggle.getAttribute("aria-expanded") === "true") setOpen(false);
    }, { passive: true });
  }

  /* ==========================================================
     Serviços: 3 no mobile, resto sob demanda
     ========================================================== */
  function initCardsMore() {
    var btn = $("[data-cards-more]");
    var list = $("[data-services]");
    if (!btn || !list) return;

    btn.addEventListener("click", function () {
      var expanded = list.classList.toggle("is-expanded");
      btn.setAttribute("aria-expanded", expanded ? "true" : "false");
      btn.textContent = expanded ? "Ver menos" : "Ver todos os 6 serviços";
      if (!expanded) {
        var top = list.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      }
    });
  }

  /* ==========================================================
     Botão flutuante + parallax do hero
     ========================================================== */
  function initScroll() {
    var floatBtn = $(".wa-float");
    var heroMedia = $("[data-parallax]");
    var past = false;
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY || 0;

      var nowPast = y > Math.min(window.innerHeight * 0.72, 620);
      if (nowPast !== past) {
        past = nowPast;
        if (floatBtn) floatBtn.classList.toggle("is-visible", past);
      }

      if (heroMedia && !reduced && y < window.innerHeight * 1.3) {
        heroMedia.style.transform = "translateY(" + (y * 0.16).toFixed(1) + "px)";
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  }

  /* ==========================================================
     Reveal on scroll
     ========================================================== */
  function initReveal() {
    if (reduced || !("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.transitionDelay = parseInt(el.dataset.revealDelay || "0", 10) + "ms";
        el.classList.add("is-revealed");
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    function scan() {
      $$("[data-reveal]:not([data-revealed])").forEach(function (el) {
        el.setAttribute("data-revealed", "1");
        // já visível na dobra: não esconder, senão o usuário vê a página piscar
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
        el.classList.add("is-hidden");
        io.observe(el);
      });
    }

    scan();
    [250, 900, 2000].forEach(function (t) { setTimeout(scan, t); });
  }

  /* ==========================================================
     Boot
     ========================================================== */
  function boot() {
    initBusinessData();
    initSeo();
    initHero();
    initStaticWa();
    initCalculator();
    initFaq();
    initLightbox();
    initForm();
    initMobileMenu();
    initCardsMore();
    initScroll();
    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
