(() => {
  'use strict';

  const PRIZES = {
    50: { weight: 10, desc: '愿这份小惊喜，点亮你今天的每一刻。' },
    100: { weight: 15, desc: '好运正在加倍，今天的美好与你撞个满怀。' },
    150: { weight: 25, desc: '幸运稳稳落袋，愿这份喜悦延续一整天。' },
    500: { weight: 50, desc: '大奖到来，愿你事事顺遂，好运常在。' },
  };

  const SEGMENT_ANGLE = 360 / Object.keys(PRIZES).length;
  // 指针竖直向上，指针对应的转盘角度为 0 度（从 11 点方向开始，顺时针排布）
  const START_OFFSET = -SEGMENT_ANGLE / 2;
  const AMOUNTS = Object.keys(PRIZES).map(Number);

  // 本轮实际参与抽奖的权重：500 元不在奖池中发放
  const ACTIVE_WEIGHTS = {
    50: 10,
    100: 15,
    150: 25,
    500: 0,
  };

  const wheel = document.getElementById('wheel');
  const bulbs = document.getElementById('bulbs');
  const pointer = document.getElementById('pointer');
  const drawButton = document.getElementById('drawButton');
  const drawText = document.getElementById('drawText');
  const drawKicker = document.getElementById('drawKicker');
  const drawHint = document.getElementById('drawHint');
  const wheelLabels = Array.from(wheel.querySelectorAll('.wheel-label'));
  const result = document.getElementById('result');
  const resultAmount = document.getElementById('resultAmount');
  const resultDesc = document.getElementById('resultDesc');
  const resultTitle = document.getElementById('resultTitle');
  const resultButton = document.getElementById('resultButton');
  const confetti = document.getElementById('confetti');
  const announcement = document.getElementById('announcement');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    rotation: 0,
    spinning: false,
    lastWinner: null,
  };

  let stopPointerAnimation = null;

  /* ---------------- 轮盘装饰 ---------------- */

  function buildBulbs() {
    const total = 32;
    const radius = 49.6; // 百分比，贴近轮盘外圈
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < total; i += 1) {
      const angle = (i / total) * 360;
      const rad = ((angle - 90) * Math.PI) / 180;
      const x = 50 + radius * Math.cos(rad);
      const y = 50 + radius * Math.sin(rad);

      const bulb = document.createElement('span');
      bulb.className = 'bulb';
      bulb.style.left = `${x}%`;
      bulb.style.top = `${y}%`;
      bulb.style.animationDelay = `${(i % 4) * 0.4}s`;
      fragment.appendChild(bulb);
    }

    bulbs.appendChild(fragment);
  }

  /* ---------------- 概率计算 ---------------- */

  function pickWeighted(weights) {
    const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let ticket = Math.random() * total;

    for (const [amount, weight] of entries) {
      ticket -= weight;
      if (ticket < 0) return Number(amount);
    }

    return Number(entries[entries.length - 1][0]);
  }

  function segmentCenterAngle(amount) {
    const index = AMOUNTS.indexOf(amount);
    return START_OFFSET + SEGMENT_ANGLE * index + SEGMENT_ANGLE / 2;
  }

  /* ---------------- 指针动效 ---------------- */

  function animatePointer(fromAngle, toAngle, duration, easing) {
    if (stopPointerAnimation) stopPointerAnimation();

    let start = null;
    let rafId = null;

    const frame = (now) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      const eased = easing(progress);
      const angle = fromAngle + (toAngle - fromAngle) * eased;
      pointer.style.transform = `rotate(${angle}deg)`;

      if (progress < 1) {
        rafId = requestAnimationFrame(frame);
      }
    };

    rafId = requestAnimationFrame(frame);
    stopPointerAnimation = () => {
      cancelAnimationFrame(rafId);
      stopPointerAnimation = null;
    };
    return stopPointerAnimation;
  }

  function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /* ---------------- 抽奖流程 ---------------- */

  function setSpinningState(spinning) {
    state.spinning = spinning;
    drawButton.disabled = spinning;
    drawButton.setAttribute('aria-busy', String(spinning));
    wheel.classList.toggle('is-spinning', spinning);

    if (spinning) {
      drawKicker.textContent = 'ROLLING';
      drawText.textContent = '转动中';
      drawHint.textContent = '请稍候';
    } else {
      drawKicker.textContent = 'LUCKY DRAW';
      drawText.textContent = '再抽一次';
      drawHint.textContent = '点击启动';
    }
  }

  function draw() {
    if (state.spinning) return;

    const winner = pickWeighted(ACTIVE_WEIGHTS);
    state.lastWinner = winner;
    setSpinningState(true);

    const center = segmentCenterAngle(winner);
    const jitter = (SEGMENT_ANGLE / 2) * 0.56 * (Math.random() * 2 - 1);
    const targetMod = (center + jitter + 360) % 360;

    const currentMod = ((state.rotation % 360) + 360) % 360;
    let delta = (targetMod - currentMod + 360) % 360;
    const tuning = (2 + Math.floor(Math.random() * 2)) * 360;
    const total = delta + tuning;

    const from = state.rotation;
    const to = from + total;
    const duration = 4800 + Math.random() * 700;

    animatePointer(from, to, duration, easeOutQuint);

    window.setTimeout(() => {
      state.rotation = to;
      pointer.style.transform = `rotate(${to}deg)`;
      setSpinningState(false);
      highlightLabel(winner);
      showResult(winner);
    }, duration + 60);
  }

  function highlightLabel(amount) {
    wheelLabels.forEach((label) => {
      const value = Number(label.dataset.amount);
      label.style.transition = 'filter 300ms ease';
      label.style.filter = value === amount ? 'drop-shadow(0 0 10px rgba(255, 226, 164, 0.95))' : '';
    });
  }

  /* ---------------- 结果弹层 ---------------- */

  let lastFocusedElement = null;
  let closeTimer = null;

  function spawnConfetti() {
    if (reduceMotion.matches) return;

    const colors = ['#f6c76e', '#ffe9bd', '#e85b72', '#ff8664', '#fff3d4', '#b8873a'];
    const pieces = 70;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--fall', `${2.6 + Math.random() * 2.4}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.6}s`);
      piece.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 160}px`);
      piece.style.setProperty('--spin', `${360 + Math.random() * 720}deg`);
      piece.style.width = `${5 + Math.random() * 6}px`;
      piece.style.height = `${8 + Math.random() * 10}px`;
      if (Math.random() > 0.6) piece.style.borderRadius = '50%';
      fragment.appendChild(piece);
    }

    confetti.replaceChildren(fragment);
  }

  function showResult(amount) {
    lastFocusedElement = document.activeElement;

    resultAmount.textContent = String(amount);
    resultTitle.textContent = amount >= 500 ? '大奖降临' : '好运降临';
    resultDesc.textContent = PRIZES[amount].desc;
    announcement.textContent = `恭喜你抽中 ${amount} 元！`;

    result.hidden = false;
    // 强制重排，确保过渡动画生效
    void result.offsetWidth;
    result.classList.add('is-open');
    spawnConfetti();

    window.setTimeout(() => resultButton.focus({ preventScroll: true }), 60);
  }

  function hideResult() {
    result.classList.remove('is-open');
    window.clearTimeout(closeTimer);

    closeTimer = window.setTimeout(() => {
      result.hidden = true;
      confetti.replaceChildren();
    }, reduceMotion.matches ? 0 : 340);

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus({ preventScroll: true });
    } else {
      drawButton.focus({ preventScroll: true });
    }

    // 指针平滑归位到 0 度，避免视觉上停在不可见的小数角度
    if (reduceMotion.matches) {
      pointer.style.transform = 'rotate(0deg)';
    } else {
      animatePointer(state.rotation, 0, 700, easeInOutCubic);
    }
    state.rotation = 0;

    wheelLabels.forEach((label) => {
      label.style.filter = '';
    });
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || result.hidden) return;
    // 弹层内只有一组可聚焦控件，Tab 始终停留在「收下好运」按钮上
    event.preventDefault();
    resultButton.focus();
  }

  /* ---------------- 事件绑定 ---------------- */

  drawButton.addEventListener('click', draw);
  resultButton.addEventListener('click', hideResult);

  result.addEventListener('click', (event) => {
    if (event.target === result) hideResult();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !result.hidden) {
      hideResult();
      return;
    }
    trapFocus(event);
  });

  /* ---------------- 初始化 ---------------- */

  buildBulbs();
})();
