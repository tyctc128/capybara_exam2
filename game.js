(() => {
  "use strict";

  const TARGET_SCORE = 10;
  const GAME_SECONDS = 80;
  const MAX_HEARTS = 5;
  const POP_GIF = "assets/sprites/capy-pop/animation.gif";
  const HIT_GIF = "assets/sprites/capy-hit/animation.gif";

  const $ = (selector) => document.querySelector(selector);
  const mapScreen = $("#mapScreen");
  const gameScreen = $("#gameScreen");
  const holesGrid = $("#holesGrid");
  const dialogOverlay = $("#dialogOverlay");
  const countdownOverlay = $("#countdownOverlay");
  const resultOverlay = $("#resultOverlay");
  const pauseOverlay = $("#pauseOverlay");
  const questionCard = $("#questionCard");
  const timeValue = $("#timeValue");
  const scoreValue = $("#scoreValue");
  const heartsBox = $("#hearts");
  const feedback = $("#feedback");
  const phaseLabel = $("#phaseLabel");
  const hammerCursor = $("#hammerCursor");

  const tutorialPages = [
    ["歡迎來到九九挑戰！", "畫面上方會出現一題九九乘法，先在心裡算出答案。"],
    ["找出正確答案", "卡皮巴拉會從九個洞口冒出來，牠們手上的數字只有一個是正確答案。"],
    ["敲下去！", "用滑鼠或手指敲中正確的卡皮巴拉。敲錯會失去一顆愛心。"],
    ["小心愛心", "每局有五顆愛心。正確答案自己縮回去不扣血，但會浪費寶貴時間。"],
    ["挑戰目標", "請在 80 秒內答對 10 題。越接近最後，卡皮巴拉會越快、出現得越多！"]
  ];

  const state = {
    mode: "map",
    score: 0,
    hearts: MAX_HEARTS,
    seconds: GAME_SECONDS,
    correctAnswer: 0,
    currentQuestionKey: "",
    recentQuestions: [],
    activeHoles: [],
    locked: false,
    paused: false,
    sound: localStorage.getItem("capy-sound") !== "off",
    deadline: 0,
    timerId: null,
    spawnId: null,
    tutorialIndex: 0,
    audioContext: null
  };

  const holes = Array.from({ length: 9 }, (_, index) => {
    const button = document.createElement("button");
    button.className = "hole";
    button.type = "button";
    button.setAttribute("aria-label", `第 ${index + 1} 個洞口`);
    button.dataset.index = String(index);
    button.innerHTML = `
      <span class="capy-wrap">
        <img class="capy-img" src="${POP_GIF}" alt="卡皮巴拉" draggable="false" />
        <span class="answer-badge"></span>
      </span>`;
    button.addEventListener("pointerdown", (event) => hitHole(event, index));
    holesGrid.appendChild(button);
    return button;
  });

  function updateBestScore() {
    const best = Number(localStorage.getItem("capy-best") || 0);
    $("#bestScore").textContent = `${best} / ${TARGET_SCORE}`;
  }

  function showScreen(name) {
    mapScreen.classList.toggle("active", name === "map");
    gameScreen.classList.toggle("active", name === "game");
    state.mode = name;
  }

  function openTutorial() {
    state.tutorialIndex = 0;
    renderTutorial();
    dialogOverlay.classList.remove("hidden");
    playTone(520, .08, "sine", .035);
  }

  function renderTutorial() {
    const [title, text] = tutorialPages[state.tutorialIndex];
    $("#dialogTitle").textContent = title;
    $("#dialogText").textContent = text;
    $("#dialogBack").disabled = state.tutorialIndex === 0;
    $("#dialogNext").textContent = state.tutorialIndex === tutorialPages.length - 1 ? "開始挑戰！" : "下一句";
    $("#dialogDots").innerHTML = tutorialPages.map((_, i) => `<span class="dialog-dot ${i === state.tutorialIndex ? "active" : ""}"></span>`).join("");
  }

  function nextTutorial() {
    if (state.tutorialIndex < tutorialPages.length - 1) {
      state.tutorialIndex += 1;
      renderTutorial();
      playTone(620 + state.tutorialIndex * 30, .05, "sine", .025);
      return;
    }
    dialogOverlay.classList.add("hidden");
    beginCountdown();
  }

  function beginCountdown() {
    showScreen("game");
    resetGameVisuals();
    countdownOverlay.classList.remove("hidden");
    let count = 3;
    $("#countdownValue").textContent = count;
    playTone(440, .12, "square", .035);
    const countTimer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        $("#countdownValue").textContent = count;
        playTone(440 + (3 - count) * 90, .12, "square", .035);
      } else if (count === 0) {
        $("#countdownValue").textContent = "GO!";
        playSuccessJingle();
      } else {
        clearInterval(countTimer);
        countdownOverlay.classList.add("hidden");
        startGame();
      }
    }, 760);
  }

  function resetGameVisuals() {
    state.score = 0;
    state.hearts = MAX_HEARTS;
    state.seconds = GAME_SECONDS;
    state.locked = false;
    state.paused = false;
    questionCard.textContent = "準備好了嗎？";
    timeValue.textContent = String(GAME_SECONDS);
    scoreValue.textContent = `0/${TARGET_SCORE}`;
    phaseLabel.textContent = "熱身時間！";
    renderHearts();
    clearAllHoles(true);
  }

  function startGame() {
    clearTimers();
    state.deadline = performance.now() + GAME_SECONDS * 1000;
    state.timerId = window.setInterval(updateTimer, 100);
    nextQuestion();
  }

  function updateTimer() {
    if (state.paused || state.mode !== "game") return;
    const remaining = Math.max(0, Math.ceil((state.deadline - performance.now()) / 1000));
    if (remaining !== state.seconds) {
      state.seconds = remaining;
      timeValue.textContent = String(remaining);
      timeValue.parentElement.classList.toggle("urgent", remaining <= 10);
      updatePhaseLabel();
    }
    if (remaining <= 0) finishGame(false, "時間到了！");
  }

  function updatePhaseLabel() {
    if (state.seconds > 55) phaseLabel.textContent = "熱身時間！";
    else if (state.seconds > 25) phaseLabel.textContent = "速度提升！";
    else phaseLabel.textContent = "最後衝刺！";
  }

  function getDifficulty() {
    if (state.seconds > 55) return { min: 2, max: 3, visible: 1900, gap: 360 };
    if (state.seconds > 25) return { min: 3, max: 4, visible: 1400, gap: 260 };
    return { min: 4, max: 6, visible: 1000, gap: 170 };
  }

  function randomProblem() {
    let a, b, key;
    let guard = 0;
    do {
      a = randomInt(2, 9);
      b = randomInt(2, 9);
      key = [Math.min(a, b), Math.max(a, b)].join("x");
      guard += 1;
    } while (state.recentQuestions.includes(key) && guard < 30);
    state.recentQuestions.push(key);
    if (state.recentQuestions.length > 8) state.recentQuestions.shift();
    return { a, b, key, answer: a * b };
  }

  function nextQuestion() {
    if (state.mode !== "game" || state.paused) return;
    state.locked = false;
    clearAllHoles(true);
    const problem = randomProblem();
    state.correctAnswer = problem.answer;
    state.currentQuestionKey = problem.key;
    questionCard.textContent = `${problem.a} × ${problem.b} = ?`;
    spawnOptions();
  }

  function makeOptions(correct, count) {
    const options = new Set([correct]);
    const nearby = [
      correct - 9, correct + 9, correct - 8, correct + 8,
      correct - 7, correct + 7, correct - 6, correct + 6,
      correct - 5, correct + 5, correct - 4, correct + 4,
      correct - 3, correct + 3, correct - 2, correct + 2,
      correct - 1, correct + 1
    ].filter((n) => n >= 4 && n <= 81 && n !== correct);
    shuffle(nearby);
    while (options.size < count && nearby.length) options.add(nearby.pop());
    while (options.size < count) options.add(randomInt(4, 81));
    return shuffle([...options]);
  }

  function spawnOptions() {
    if (state.mode !== "game" || state.paused || state.locked) return;
    clearAllHoles(true);
    const difficulty = getDifficulty();
    const count = randomInt(difficulty.min, difficulty.max);
    const selectedIndices = shuffle([...Array(9).keys()]).slice(0, count);
    const options = makeOptions(state.correctAnswer, count);
    state.activeHoles = selectedIndices;

    selectedIndices.forEach((holeIndex, order) => {
      const hole = holes[holeIndex];
      const answer = options[order];
      hole.dataset.answer = String(answer);
      hole.querySelector(".answer-badge").textContent = String(answer);
      const image = hole.querySelector(".capy-img");
      image.src = `${POP_GIF}?v=${Date.now()}-${holeIndex}`;
      window.setTimeout(() => {
        if (!state.paused && !state.locked && state.mode === "game") hole.classList.add("active");
      }, order * randomInt(35, 115));
    });

    state.spawnId = window.setTimeout(() => {
      if (state.locked || state.paused || state.mode !== "game") return;
      selectedIndices.forEach((i) => holes[i].classList.add("leaving"));
      window.setTimeout(() => {
        clearAllHoles(true);
        state.spawnId = window.setTimeout(spawnOptions, difficulty.gap);
      }, 230);
    }, difficulty.visible);
  }

  function hitHole(event, index) {
    if (state.mode !== "game" || state.paused || state.locked) return;
    const hole = holes[index];
    if (!hole.classList.contains("active")) return;
    event.preventDefault();
    state.locked = true;
    if (state.spawnId) clearTimeout(state.spawnId);
    swingHammer(event.clientX, event.clientY);
    const answer = Number(hole.dataset.answer);
    const correct = answer === state.correctAnswer;
    hole.classList.add("hit");
    hole.querySelector(".capy-img").src = `${HIT_GIF}?v=${Date.now()}`;

    if (correct) {
      state.score += 1;
      scoreValue.textContent = `${state.score}/${TARGET_SCORE}`;
      showFeedback("答對了！", true);
      playSuccessJingle();
      const best = Math.max(state.score, Number(localStorage.getItem("capy-best") || 0));
      localStorage.setItem("capy-best", String(best));
    } else {
      state.hearts -= 1;
      renderHearts();
      showFeedback("再想一下！", false);
      playWrongSound();
    }

    holes.forEach((other, i) => {
      if (i !== index) other.classList.add("leaving");
      other.classList.remove("active");
    });

    window.setTimeout(() => {
      if (state.score >= TARGET_SCORE) finishGame(true, "你完成了九九挑戰！");
      else if (state.hearts <= 0) finishGame(false, "愛心用完了，再試一次吧！");
      else nextQuestion();
    }, 650);
  }

  function clearAllHoles(immediate = false) {
    if (state.spawnId) clearTimeout(state.spawnId);
    holes.forEach((hole) => {
      hole.classList.remove("active", "leaving", "hit");
      hole.dataset.answer = "";
      if (immediate) hole.querySelector(".answer-badge").textContent = "";
    });
    state.activeHoles = [];
  }

  function renderHearts() {
    heartsBox.innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<span class="heart ${i >= state.hearts ? "lost" : ""}" aria-hidden="true">❤</span>`).join("");
    heartsBox.setAttribute("aria-label", `剩餘 ${state.hearts} 顆愛心`);
  }

  function showFeedback(text, correct) {
    feedback.textContent = correct ? `✓ ${text}` : `✕ ${text}`;
    feedback.className = `feedback ${correct ? "correct" : "wrong"}`;
    void feedback.offsetWidth;
    feedback.classList.add("show");
  }

  function finishGame(success, message) {
    if (state.mode !== "game") return;
    clearTimers();
    clearAllHoles(true);
    state.locked = true;
    $("#resultMascot").textContent = success ? "🏆" : "💪";
    $("#resultTitle").textContent = success ? "挑戰成功！" : "挑戰結束";
    $("#resultMessage").textContent = message;
    $("#resultScore").textContent = `${state.score} / ${TARGET_SCORE}`;
    $("#resultTime").textContent = `${state.seconds} 秒`;
    resultOverlay.classList.remove("hidden");
    updateBestScore();
    if (success) playVictory();
    else playWrongSound();
  }

  function clearTimers() {
    if (state.timerId) clearInterval(state.timerId);
    if (state.spawnId) clearTimeout(state.spawnId);
    state.timerId = null;
    state.spawnId = null;
  }

  function pauseGame() {
    if (state.mode !== "game" || state.locked) return;
    state.paused = true;
    state.pauseStartedAt = performance.now();
    pauseOverlay.classList.remove("hidden");
  }

  function resumeGame() {
    if (!state.paused) return;
    state.deadline += performance.now() - state.pauseStartedAt;
    state.paused = false;
    pauseOverlay.classList.add("hidden");
    spawnOptions();
  }

  function returnToMap() {
    clearTimers();
    state.paused = false;
    state.locked = false;
    [dialogOverlay, countdownOverlay, resultOverlay, pauseOverlay].forEach((el) => el.classList.add("hidden"));
    showScreen("map");
    updateBestScore();
  }

  function swingHammer(x, y) {
    hammerCursor.style.left = `${x}px`;
    hammerCursor.style.top = `${y}px`;
    gameScreen.classList.add("pointer-active");
    hammerCursor.classList.remove("swing");
    void hammerCursor.offsetWidth;
    hammerCursor.classList.add("swing");
    window.setTimeout(() => hammerCursor.classList.remove("swing"), 300);
  }

  function setupPointer() {
    gameScreen.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      gameScreen.classList.add("pointer-active");
      hammerCursor.style.left = `${event.clientX}px`;
      hammerCursor.style.top = `${event.clientY}px`;
    });
    gameScreen.addEventListener("pointerleave", () => gameScreen.classList.remove("pointer-active"));
  }

  function getAudioContext() {
    if (!state.sound) return null;
    if (!state.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) state.audioContext = new AudioCtx();
    }
    if (state.audioContext?.state === "suspended") state.audioContext.resume();
    return state.audioContext;
  }

  function playTone(frequency, duration, type = "sine", volume = .04, delay = 0) {
    const context = getAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, context.currentTime + delay);
    gain.gain.linearRampToValueAtTime(volume, context.currentTime + delay + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + duration + .02);
  }

  function playSuccessJingle() {
    playTone(660, .13, "sine", .04);
    playTone(880, .16, "sine", .04, .09);
  }

  function playWrongSound() {
    playTone(210, .16, "triangle", .05);
    playTone(160, .2, "triangle", .04, .1);
  }

  function playVictory() {
    [523, 659, 784, 1047].forEach((note, i) => playTone(note, .24, "sine", .045, i * .11));
  }

  function toggleSound() {
    state.sound = !state.sound;
    localStorage.setItem("capy-sound", state.sound ? "on" : "off");
    $("#soundToggleMap").textContent = state.sound ? "🔊" : "🔇";
    if (state.sound) playTone(700, .08, "sine", .03);
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  $("#teacherHotspot").addEventListener("click", openTutorial);
  $("#stageHotspot").addEventListener("click", openTutorial);
  $("#dialogNext").addEventListener("click", nextTutorial);
  $("#dialogBack").addEventListener("click", () => {
    if (state.tutorialIndex > 0) {
      state.tutorialIndex -= 1;
      renderTutorial();
    }
  });
  $("#pauseButton").addEventListener("click", pauseGame);
  $("#resumeButton").addEventListener("click", resumeGame);
  $("#quitButton").addEventListener("click", returnToMap);
  $("#mapButton").addEventListener("click", returnToMap);
  $("#retryButton").addEventListener("click", () => {
    resultOverlay.classList.add("hidden");
    beginCountdown();
  });
  $("#soundToggleMap").addEventListener("click", toggleSound);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "game" && !state.paused && !state.locked) pauseGame();
  });

  setupPointer();
  renderHearts();
  updateBestScore();
  $("#soundToggleMap").textContent = state.sound ? "🔊" : "🔇";
})();
