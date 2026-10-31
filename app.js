/**
 * app.js
 * ---------------------------------------------------------------
 * Interface do chat. A geração de respostas fica isolada em
 * `AssistantService` (assistant.js).
 *
 * Adequação aos padrões do People + AI Guidebook v2 (Google PAIR)
 * — https://pair.withgoogle.com/guidebook-v2/patterns
 *
 *   Set the right expectations ............ banner de escopo + onboarding
 *                                           com limites + diálogo "Como funciona"
 *   Explain the benefit, not the technology  textos de benefício na UI;
 *                                           detalhe técnico só fora do fluxo
 *   Explain for understanding ............. explicação curta e sob demanda
 *   Go beyond in-the-moment explanations .. diálogo "Como funciona"
 *   Determine how to show model confidence  selo qualitativo (alta/média/baixa)
 *                                           + "Por quê?" + recurso se não for alta
 *   Let users give feedback ............... útil / não útil com efeito real
 *                                           e confirmação que diz o efeito
 *   Let users supervise automation ........ parar, gerar de novo, ocultar, editar
 *   Make it safe to explore ............... toda ação destrutiva tem "Desfazer"
 *   Be accountable for errors ............. estado de erro + "Tentar novamente"
 *   Give control back to the user ......... interromper e assumir a conversa
 *   Anchor on familiarity ................. <dialog> nativo, chips, botões padrão
 *   Be transparent about data ............ nota fixa de privacidade + detalhes
 * ---------------------------------------------------------------
 */

(function () {
  "use strict";

  /* ---------------- Constantes ---------------- */

  var ROLE = { user: "user", assistant: "assistant" };

  var CONFIDENCE_LABEL = {
    high: "Confiança alta",
    medium: "Confiança média",
    low: "Confiança baixa"
  };

  var INTRO_TEXT =
    "Olá! Eu sou o AI Assistant. Posso conversar com você aqui, dizer o quanto entendi de cada resposta " +
    "e manter o histórico enquanto esta página estiver aberta.\n\n" +
    "O que eu não faço: não verifico fatos nem acesso a internet. Minhas respostas são geradas pelo " +
    "Google Gemini e podem estar erradas — quando não tiver certeza, eu digo isso em vez de inventar.\n\n" +
    "Comece por uma das sugestões abaixo ou escreva do seu jeito.";

  var ERROR_TEXT =
    "Algo deu errado ao gerar esta resposta. Você pode tentar de novo ou continuar escrevendo outra mensagem.";

  function svg(inner) {
    return (
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner +
      "</svg>"
    );
  }

  var ICON = {
    thumbUp: svg(
      '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/>' +
        '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>'
    ),
    thumbDown: svg(
      '<g transform="rotate(180 12 12)">' +
        '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/>' +
        '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>' +
        "</g>"
    ),
    refresh: svg(
      '<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>' +
        '<path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>'
    ),
    eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg(
      '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>' +
        '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
        '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>'
    ),
    edit: svg('<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>'),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>')
  };

  /* ---------------- Estado ---------------- */

  var state = {
    messages: [],
    nextId: 1,
    busy: false,
    controller: null,
    editTargetId: null,
    toastTimer: null
  };

  /* ---------------- Elementos ---------------- */

  var el = {
    messages: document.getElementById("messages"),
    form: document.getElementById("composer-form"),
    input: document.getElementById("message-input"),
    sendBtn: document.getElementById("send-btn"),
    stopBtn: document.getElementById("stop-btn"),
    status: document.getElementById("composer-status"),
    suggestions: document.getElementById("suggestions"),
    newChatBtn: document.getElementById("new-chat-btn"),
    helpBtn: document.getElementById("help-btn"),
    helpDialog: document.getElementById("help-dialog"),
    helpClose: document.getElementById("help-close"),
    helpOk: document.getElementById("help-ok"),
    disclosure: document.getElementById("disclosure"),
    disclosureMore: document.getElementById("disclosure-more"),
    disclosureDismiss: document.getElementById("disclosure-dismiss"),
    privacyMore: document.getElementById("privacy-more"),
    toastRegion: document.getElementById("toast-region")
  };

  /* ---------------- Utilitários ---------------- */

  var DISCLOSURE_KEY = "ai-assistant-disclosure-dismissed";

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function scrollToBottom() {
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function autoResizeInput() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 160) + "px";
  }

  function removeNode(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function getMessage(id) {
    for (var i = 0; i < state.messages.length; i += 1) {
      if (state.messages[i].id === id) {
        return state.messages[i];
      }
    }
    return null;
  }

  function sessionSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {
      /* Armazenamento indisponível: seguimos sem persistir nada. */
    }
  }

  function sessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  /* ---------------- Barra de status ---------------- */

  function setStatus(message, action) {
    el.status.textContent = "";

    if (!message) {
      el.status.hidden = true;
      return;
    }

    el.status.hidden = false;

    var text = document.createElement("span");
    text.textContent = message;
    el.status.appendChild(text);

    if (action) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link-btn";
      btn.textContent = action.label;
      btn.addEventListener("click", action.onClick);
      el.status.appendChild(btn);
    }
  }

  function clearStatus() {
    setStatus("");
  }

  /* ---------------- Toast com desfazer ---------------- */

  function dismissToast() {
    window.clearTimeout(state.toastTimer);
    state.toastTimer = null;
    el.toastRegion.textContent = "";
  }

  function toast(message, action) {
    dismissToast();

    var box = document.createElement("div");
    box.className = "toast";

    var text = document.createElement("p");
    text.className = "toast__text";
    text.textContent = message;
    box.appendChild(text);

    if (action) {
      var actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "btn btn--sm btn--ghost toast__action";
      actionBtn.textContent = action.label;
      actionBtn.addEventListener("click", function () {
        dismissToast();
        action.onAction();
      });
      box.appendChild(actionBtn);
    }

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn icon-btn--sm";
    closeBtn.title = "Fechar aviso";
    closeBtn.setAttribute("aria-label", "Fechar aviso");
    closeBtn.innerHTML = ICON.close;
    closeBtn.addEventListener("click", dismissToast);
    box.appendChild(closeBtn);

    el.toastRegion.appendChild(box);
    state.toastTimer = window.setTimeout(dismissToast, action ? 9000 : 4500);
  }

  /* ---------------- Construção de mensagens ---------------- */

  function createTypingDots() {
    var dots = document.createElement("span");
    dots.className = "typing";
    for (var i = 0; i < 3; i += 1) {
      var dot = document.createElement("span");
      dot.className = "typing__dot";
      dots.appendChild(dot);
    }
    return dots;
  }

  function actionButton(label, iconMarkup, onClick, selector) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-btn";
    btn.innerHTML = iconMarkup + '<span class="action-btn__label">' + label + "</span>";
    btn.addEventListener("click", onClick);
    if (selector) {
      btn.dataset.action = selector;
    }
    return btn;
  }

  function buildMessageNode(msg) {
    var isUser = msg.role === ROLE.user;

    var wrapper = document.createElement("article");
    wrapper.className = "message message--" + (isUser ? "user" : "assistant");
    wrapper.dataset.role = msg.role;

    var avatar = document.createElement("span");
    avatar.className = "message__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = isUser ? "EU" : "AI";

    var body = document.createElement("div");
    body.className = "message__body";

    var meta = document.createElement("div");
    meta.className = "message__meta";

    var author = document.createElement("span");
    author.className = "message__author";
    author.textContent = isUser ? "Você" : "AI Assistant";

    var timeEl = document.createElement("time");
    timeEl.className = "message__time";
    timeEl.dateTime = msg.time.toISOString();
    timeEl.textContent = formatTime(msg.time);

    meta.appendChild(author);
    meta.appendChild(timeEl);

    var bubble = document.createElement("div");
    bubble.className = "message__bubble";

    var footer = document.createElement("div");
    footer.className = "message__footer";

    body.appendChild(meta);
    body.appendChild(bubble);
    body.appendChild(footer);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);

    msg.node = wrapper;
    msg.parts = { bubble: bubble, footer: footer, timeEl: timeEl };

    renderMessageContent(msg);
    return wrapper;
  }

  /**
   * Preenche bolha e rodapé conforme o estado da mensagem.
   * Reexecutar não reinicia a animação de entrada (o nó não é recriado).
   */
  function renderMessageContent(msg) {
    var bubble = msg.parts.bubble;
    var footer = msg.parts.footer;

    bubble.textContent = "";
    footer.textContent = "";
    footer.hidden = true;

    msg.node.classList.toggle("is-hidden", !!msg.hidden);
    msg.node.classList.toggle("is-error", !!msg.isError);

    if (msg.isPending) {
      bubble.appendChild(createTypingDots());
      msg.node.setAttribute("aria-busy", "true");
      return;
    }
    msg.node.removeAttribute("aria-busy");

    /* --- Resposta oculta (padrão "Let users give feedback" / "Make it safe") --- */
    if (msg.hidden) {
      msg.node.classList.add("is-collapsed");
      var hiddenNote = document.createElement("p");
      hiddenNote.className = "message__note";
      hiddenNote.textContent = "Resposta oculta.";
      footer.appendChild(hiddenNote);
      footer.appendChild(
        actionButton("Mostrar", ICON.eye, function () {
          toggleHide(msg);
        })
      );
      footer.hidden = false;
      return;
    }
    msg.node.classList.remove("is-collapsed");

    /* --- Erro (padrão "Be accountable for errors") --- */
    if (msg.isError) {
      bubble.textContent = ERROR_TEXT;
      footer.appendChild(
        actionButton("Tentar novamente", ICON.refresh, function () {
          respond({ replace: msg });
        })
      );
      footer.appendChild(
        disclosureToggle("Detalhes técnicos", msg.errorDetail || "Erro sem detalhes.")
      );
      footer.hidden = false;
      return;
    }

    bubble.textContent = msg.content;

    /* --- Mensagem de boas-vindas: sem ações de feedback --- */
    if (msg.isIntro) {
      return;
    }

    /* --- Mensagem do usuário: controle para corrigir o que escreveu --- */
    if (msg.role === ROLE.user) {
      footer.appendChild(
        actionButton("Editar", ICON.edit, function () {
          startEdit(msg);
        })
      );
      footer.hidden = false;
      return;
    }

    /* --- Resposta do assistente: confiança + feedback + controle --- */
    var confidence = msg.confidence;
    if (confidence) {
      var badge = document.createElement("span");
      badge.className = "badge badge--" + confidence.level;
      var dot = document.createElement("span");
      dot.className = "badge__dot";
      dot.setAttribute("aria-hidden", "true");
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode(CONFIDENCE_LABEL[confidence.level] || "Confiança"));
      footer.appendChild(badge);

      var explainId = "reason-" + msg.id;
      footer.appendChild(
        disclosureToggle("Por quê?", confidence.reason, explainId, "link-btn")
      );
    }

    /* Recurso quando a confiança não é alta (padrão de confiança do PAIR) */
    if (confidence && confidence.level !== "high") {
      var recourse = document.createElement("div");
      recourse.className = "message__recourse";

      var recourseText = document.createElement("span");
      recourseText.textContent = "Pode não ser o que você queria.";
      recourse.appendChild(recourseText);

      var rephrase = document.createElement("button");
      rephrase.type = "button";
      rephrase.className = "link-btn";
      rephrase.textContent = "Reformular";
      rephrase.addEventListener("click", function () {
        el.input.value = "";
        el.input.focus();
        setStatus("Escreva de novo com outras palavras — quanto mais detalhe, melhor eu entendo.");
      });
      recourse.appendChild(rephrase);

      var seeCapabilities = document.createElement("button");
      seeCapabilities.type = "button";
      seeCapabilities.className = "link-btn";
      seeCapabilities.textContent = "Ver o que eu entendo";
      seeCapabilities.addEventListener("click", openHelp);
      recourse.appendChild(seeCapabilities);

      footer.appendChild(recourse);
    }

    var actions = document.createElement("div");
    actions.className = "message__actions";

    var upBtn = actionButton("Útil", ICON.thumbUp, function () {
      setFeedback(msg, "up");
    });
    upBtn.setAttribute("aria-pressed", msg.feedback === "up" ? "true" : "false");
    upBtn.title = "Marcar como resposta útil";
    actions.appendChild(upBtn);

    var downBtn = actionButton("Não útil", ICON.thumbDown, function () {
      setFeedback(msg, "down");
    });
    downBtn.setAttribute("aria-pressed", msg.feedback === "down" ? "true" : "false");
    downBtn.title = "Marcar como resposta não útil";
    actions.appendChild(downBtn);

    if (isLastAssistantReply(msg)) {
      actions.appendChild(
        actionButton("Gerar de novo", ICON.refresh, function () {
          respond({ replace: msg });
        })
      );
    }

    actions.appendChild(
      actionButton("Ocultar", ICON.eyeOff, function () {
        toggleHide(msg);
      })
    );

    footer.appendChild(actions);
    footer.hidden = false;
  }

  /** Botão de explicação progressiva: só mostra o texto quando pedido. */
  function disclosureToggle(label, content, id, className) {
    var wrapper = document.createElement("span");
    wrapper.className = "disclosure";

    var detailId = id || "detail-" + Math.random().toString(36).slice(2, 8);

    var detail = document.createElement("span");
    detail.className = "disclosure__content";
    detail.id = detailId;
    detail.hidden = true;
    detail.textContent = content;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = className || "action-btn";
    btn.textContent = label;
    if (className !== "link-btn") {
      btn.classList.add("action-btn--plain");
    }
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", detailId);
    btn.addEventListener("click", function () {
      detail.hidden = !detail.hidden;
      btn.setAttribute("aria-expanded", detail.hidden ? "false" : "true");
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(detail);
    return wrapper;
  }

  function isLastAssistantReply(msg) {
    for (var i = state.messages.length - 1; i >= 0; i -= 1) {
      var candidate = state.messages[i];
      if (candidate.role === ROLE.assistant && !candidate.isIntro) {
        return candidate === msg;
      }
    }
    return false;
  }

  function updateTime(msg) {
    if (msg.parts && msg.parts.timeEl) {
      msg.parts.timeEl.dateTime = msg.time.toISOString();
      msg.parts.timeEl.textContent = formatTime(msg.time);
    }
  }

  /* ---------------- Inclusão e remoção ---------------- */

  function appendMessage(partial) {
    var msg = {
      id: state.nextId,
      role: partial.role,
      content: partial.content || "",
      time: partial.time || new Date(),
      confidence: partial.confidence || null,
      ruleId: null,
      feedback: null,
      hidden: false,
      isError: false,
      isPending: !!partial.isPending,
      isIntro: !!partial.isIntro,
      errorDetail: null
    };
    state.nextId += 1;

    state.messages.push(msg);
    var node = buildMessageNode(msg);
    el.messages.appendChild(node);
    updateSuggestions();
    scrollToBottom();
    return msg;
  }

  function removeMessage(msg) {
    var index = state.messages.indexOf(msg);
    if (index !== -1) {
      state.messages.splice(index, 1);
    }
    removeNode(msg.node);
    updateSuggestions();
  }

  function updateSuggestions() {
    var hasConversation = state.messages.some(function (msg) {
      return !msg.isIntro;
    });
    el.suggestions.hidden = hasConversation;
  }

  /* ---------------- Fluxo de resposta ---------------- */

  function getHistory() {
    return state.messages
      .filter(function (msg) {
        return !msg.isIntro && !msg.isPending && !msg.isError && msg.content;
      })
      .map(function (msg) {
        return { role: msg.role, content: msg.content };
      });
  }

  function setBusy(busy) {
    state.busy = busy;
    el.sendBtn.disabled = busy;
    el.stopBtn.hidden = !busy;
    /* O campo continua habilitado: o usuário pode escrever enquanto espera. */
  }

  /**
   * Gera uma resposta. Com `replace`, regenera a mensagem informada.
   * @param {{replace?: object}} [options]
   */
  function respond(options) {
    var opts = options || {};
    var reply = opts.replace || null;
    var controller = new AbortController();

    state.controller = controller;
    setBusy(true);

    if (reply) {
      reply.isPending = true;
      reply.isError = false;
      reply.hidden = false;
      reply.confidence = null;
      renderMessageContent(reply);
    } else {
      reply = appendMessage({ role: ROLE.assistant, isPending: true });
    }

    scrollToBottom();

    window.AssistantService.generateReply(getHistory(), { signal: controller.signal })
      .then(function (result) {
        reply.isPending = false;
        reply.isError = false;
        reply.content = result.text;
        reply.confidence = result.confidence;
        reply.ruleId = result.ruleId;
        reply.feedback = null;
        reply.time = new Date();
        renderMessageContent(reply);
        updateTime(reply);
        scrollToBottom();
      })
      .catch(function (error) {
        if (error && error.name === "AbortError") {
          removeMessage(reply);
          setStatus("Resposta interrompida. Você pode enviar outra mensagem ou tentar de novo.");
          return;
        }
        reply.isPending = false;
        reply.isError = true;
        reply.content = "";
        reply.confidence = null;
        reply.errorDetail = error && error.message ? error.message : "Erro desconhecido.";
        renderMessageContent(reply);
      })
      .then(function () {
        if (state.controller === controller) {
          state.controller = null;
        }
        setBusy(false);
        el.input.focus();
      });

    return reply;
  }

  /* ---------------- Ações do usuário ---------------- */

  function setFeedback(msg, value) {
    var next = msg.feedback === value ? null : value;

    msg.feedback = next;
    renderMessageContent(msg);

    if (next === "down") {
      toast("Anotado: esta resposta ficou marcada como não útil nesta conversa.");
    } else if (next === "up") {
      toast("Anotado: esta resposta ficou marcada como útil nesta conversa.");
    } else {
      toast("Avaliação removida.");
    }
  }

  function toggleHide(msg, silent) {
    msg.hidden = !msg.hidden;
    renderMessageContent(msg);

    if (silent) {
      return;
    }

    toast(msg.hidden ? "Resposta oculta." : "Resposta exibida novamente.", {
      label: "Desfazer",
      onAction: function () {
        toggleHide(msg, true);
      }
    });
  }

  function startEdit(msg) {
    if (state.busy) {
      setStatus("Espere a resposta atual terminar — ou use Parar — para editar uma mensagem.");
      return;
    }

    state.editTargetId = msg.id;
    el.input.value = msg.content;
    autoResizeInput();
    el.input.focus();

    setStatus(
      "Editando sua mensagem. Ao enviar, as mensagens seguintes serão removidas (dá para desfazer).",
      { label: "Cancelar", onClick: cancelEdit }
    );
  }

  function cancelEdit() {
    state.editTargetId = null;
    el.input.value = "";
    autoResizeInput();
    clearStatus();
    el.input.focus();
  }

  /** Substitui o texto da mensagem editada e remove o que vinha depois. */
  function commitEdit(newText) {
    var target = getMessage(state.editTargetId);
    cancelEdit();

    if (!target) {
      return [];
    }

    var index = state.messages.indexOf(target);
    var removed = state.messages.slice(index + 1);
    removed.forEach(function (msg) {
      removeNode(msg.node);
    });
    state.messages = state.messages.slice(0, index + 1);

    target.content = newText;
    target.time = new Date();
    renderMessageContent(target);
    updateTime(target);

    return removed;
  }

  function undoEdit(removed, generatedReply) {
    if (state.busy && state.controller) {
      state.controller.abort();
    }

    if (generatedReply && state.messages.indexOf(generatedReply) !== -1) {
      removeMessage(generatedReply);
    }

    removed.forEach(function (msg) {
      if (state.messages.indexOf(msg) === -1) {
        state.messages.push(msg);
        el.messages.appendChild(msg.node);
      }
    });

    updateSuggestions();
    scrollToBottom();
    setStatus("Edição desfeita. As mensagens voltaram como estavam.");
  }

  function handleSubmit() {
    var text = el.input.value.trim();

    if (!text) {
      el.input.focus();
      return;
    }

    if (state.busy) {
      setStatus("Ainda estou respondendo à mensagem anterior. Use Parar se quiser enviar outra agora.");
      return;
    }

    var isEditing = !!state.editTargetId;
    var removed = isEditing ? commitEdit(text) : [];

    if (!isEditing) {
      appendMessage({ role: ROLE.user, content: text });
    }

    el.input.value = "";
    autoResizeInput();
    clearStatus();

    var reply = respond();

    if (removed.length) {
      toast("Mensagens seguintes foram removidas.", {
        label: "Desfazer",
        onAction: function () {
          undoEdit(removed, reply);
        }
      });
    }
  }

  function stopResponding() {
    if (state.controller) {
      state.controller.abort();
    }
  }

  /* ---------------- Conversa ---------------- */

  function addIntroMessage() {
    appendMessage({ role: ROLE.assistant, content: INTRO_TEXT, isIntro: true });
  }

  function startNewConversation(options) {
    var opts = options || {};

    if (state.busy && state.controller) {
      state.controller.abort();
    }

    var snapshot = state.messages.slice();

    state.messages = [];
    state.editTargetId = null;
    el.messages.textContent = "";
    el.input.value = "";
    autoResizeInput();
    clearStatus();

    addIntroMessage();
    updateSuggestions();
    el.input.focus();

    if (opts.silent) {
      return;
    }

    toast("Conversa nova. A anterior existia só nesta aba — nada foi salvo ou enviado.", {
      label: "Desfazer",
      onAction: function () {
        restoreSnapshot(snapshot);
      }
    });
  }

  function restoreSnapshot(snapshot) {
    if (state.busy && state.controller) {
      state.controller.abort();
    }

    state.messages = [];
    state.editTargetId = null;
    el.messages.textContent = "";

    snapshot.forEach(function (msg) {
      state.messages.push(msg);
      el.messages.appendChild(msg.node);
    });

    updateSuggestions();
    scrollToBottom();
    setStatus("Conversa anterior restaurada.");
  }

  /* ---------------- Diálogo "Como funciona" ---------------- */

  function openHelp() {
    if (typeof el.helpDialog.showModal === "function") {
      el.helpDialog.showModal();
    } else {
      el.helpDialog.setAttribute("open", "open");
    }
  }

  function closeHelp() {
    if (typeof el.helpDialog.close === "function") {
      el.helpDialog.close();
    } else {
      el.helpDialog.removeAttribute("open");
    }
  }

  /* ---------------- Eventos ---------------- */

  el.form.addEventListener("submit", function (event) {
    event.preventDefault();
    handleSubmit();
  });

  el.input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      handleSubmit();
      return;
    }
    if (event.key === "Escape" && state.editTargetId) {
      event.preventDefault();
      cancelEdit();
    }
  });

  el.input.addEventListener("input", autoResizeInput);

  el.stopBtn.addEventListener("click", stopResponding);

  el.newChatBtn.addEventListener("click", function () {
    startNewConversation();
  });

  el.suggestions.addEventListener("click", function (event) {
    var chip = event.target.closest(".chip");
    if (!chip) {
      return;
    }
    el.input.value = chip.dataset.prompt;
    autoResizeInput();
    handleSubmit();
  });

  el.helpBtn.addEventListener("click", openHelp);
  el.disclosureMore.addEventListener("click", openHelp);
  el.privacyMore.addEventListener("click", openHelp);
  el.helpClose.addEventListener("click", closeHelp);
  el.helpOk.addEventListener("click", closeHelp);

  el.helpDialog.addEventListener("click", function (event) {
    if (event.target === el.helpDialog) {
      closeHelp();
    }
  });

  el.disclosureDismiss.addEventListener("click", function () {
    el.disclosure.hidden = true;
    sessionSet(DISCLOSURE_KEY, "1");
  });

  /* ---------------- Inicialização ---------------- */

  if (sessionGet(DISCLOSURE_KEY) === "1") {
    el.disclosure.hidden = true;
  }

  startNewConversation({ silent: true });
})();
