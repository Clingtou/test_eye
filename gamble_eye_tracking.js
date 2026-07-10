(function () {
  var state = {
    jsPsych: null,
    participantId: "",
    initialized: false,
    latestPrediction: null,
    activeTrial: null,
    activeSamples: [],
    allSamples: [],
    validationCollector: null,
    calibrationAttempts: 0,
    validationPassed: false,
    validationSummary: null
  };

  var config = {
    initialCalibrationPoints: 9,
    finalCalibrationPoints: 3,
    validationPoints: 5,
    maxCalibrationAttempts: 2,
    calibrationSettleMs: 550,
    calibrationSampleMs: 1250,
    calibrationSampleIntervalMs: 90,
    validationSettleMs: 350,
    validationSampleMs: 900,
    validationTolerancePx: 170,
    validationPassRatio: 0.65,
    tutorialCalibrationPoints: 5,
    tutorialCalibrationDurationSec: 3,
    tutorialValidationPoints: 5,
    tutorialValidationDurationSec: 2,
    tutorialValidationTolPx: 200,
    tutorialValidationThreshold: 0.7,
    centerFixationHoldMs: 500,
    centerFixationRadiusPx: 130,
    centerFixationTimeoutMs: 120000
  };

  function injectStyles() {
    if (document.getElementById("gamble-eye-style")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "gamble-eye-style";
    style.textContent = [
      ".eye-page{box-sizing:border-box;width:100vw;height:100vh;background:#fff;color:#111;overflow:auto;font-family:Arial,'Microsoft YaHei','SimHei',sans-serif;padding:54px 0;}",
      ".eye-card{box-sizing:border-box;width:min(1000px,calc(100vw - 96px));margin:0 auto;padding:38px 52px;border:1px solid #d9dfe7;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06);font-size:24px;line-height:1.65;}",
      ".eye-card h1,.eye-card h2{margin:0 0 20px 0;font-size:34px;line-height:1.25;}",
      ".eye-card ul{margin:12px 0 18px 1.25em;padding:0;}",
      ".eye-card li{margin:7px 0;}",
      ".eye-muted{color:#4b5563;font-size:20px;}",
      ".eye-warning{color:#b42318;font-weight:700;}",
      ".eye-btn{display:block;margin:30px auto 0 auto!important;font-size:26px!important;padding:12px 30px!important;border-radius:6px!important;border:1px solid #777;background:#fff;color:#000;cursor:pointer!important;}",
      ".eye-btn:disabled{opacity:.55;cursor:default!important;}",
      ".eye-stage{position:fixed;inset:0;background:rgb(128,128,128);overflow:hidden;cursor:none;}",
      ".eye-stage-note{position:absolute;left:50%;top:28px;transform:translateX(-50%);width:min(760px,calc(100vw - 120px));text-align:center;color:#fff;font-family:Arial,'Microsoft YaHei','SimHei',sans-serif;font-size:24px;line-height:1.45;text-shadow:0 1px 3px rgba(0,0,0,.25);}",
      ".eye-point{position:absolute;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;box-sizing:border-box;}",
      ".eye-point-calibration{background:#d92d20;border:4px solid #8f1d16;box-shadow:0 0 0 8px rgba(217,45,32,.16);}",
      ".eye-point-validation{background:#2f80ed;border:4px solid #1859a9;box-shadow:0 0 0 8px rgba(47,128,237,.16);}",
      ".eye-point:after{content:'';position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#fff;}",
      ".eye-tutorial-message{box-sizing:border-box;width:min(920px,calc(100vw - 96px));margin:22vh auto 0 auto;color:#111;background:#fff;font-family:Arial,'Microsoft YaHei','SimHei',sans-serif;font-size:28px;line-height:1.65;text-align:left;padding:34px 44px;border-radius:4px;}",
      "#calibration_dot,#validation_dot{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background-color:#dd494b;z-index:10000;text-align:center;color:#fff;font-family:Arial,sans-serif;font-size:16px;line-height:30px;}",
      "#calibration_cnt,#validation_cnt{width:30px;height:30px;line-height:30px;text-align:center;color:#fff;font-weight:700;}",
      "#webgazerVideoContainer{position:fixed!important;right:20px!important;bottom:20px!important;left:auto!important;top:auto!important;z-index:11000!important;border:2px solid #d9dfe7!important;background:#fff!important;box-shadow:0 2px 10px rgba(0,0,0,.18)!important;}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function init(jsPsych, participantId) {
    state.jsPsych = jsPsych;
    state.participantId = participantId || "";
    injectStyles();
    jsPsych.data.addProperties({
      eye_tracking: 1,
      eye_tracking_library: "webgazer",
      eye_tracking_calibration_mode: "webgazertutorial_watch",
      eye_tracking_records: "timestamped_screen_coordinates_by_choice_trial",
      eye_validation_tolerance_px: config.tutorialValidationTolPx,
      eye_validation_pass_ratio: config.tutorialValidationThreshold
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function waitForSpace() {
    return new Promise(function (resolve) {
      var onkeyup = function (event) {
        if (event.keyCode === 32 || event.key === " ") {
          window.removeEventListener("keyup", onkeyup);
          resolve();
        }
      };
      window.addEventListener("keyup", onkeyup);
    });
  }

  function vectorLength(x, y) {
    return Math.sqrt((x * x) + (y * y));
  }

  function shuffle(points) {
    var output = points.slice();
    for (var i = output.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = output[i];
      output[i] = output[j];
      output[j] = temp;
    }
    return output;
  }

  function prepareTutorialReferencePoints(num) {
    var points = shuffle([
      { x: "50%", y: "20%" },
      { x: "80%", y: "20%" },
      { x: "20%", y: "50%" },
      { x: "80%", y: "50%" },
      { x: "20%", y: "80%" },
      { x: "50%", y: "80%" },
      { x: "80%", y: "80%" },
      { x: "35%", y: "35%" },
      { x: "65%", y: "35%" },
      { x: "35%", y: "65%" },
      { x: "65%", y: "65%" },
      { x: "20%", y: "20%" }
    ]);
    points.length = num;
    points[0] = { x: "50%", y: "50%" };
    return points;
  }

  function getPointPositions(count) {
    if (count === 3) {
      return [
        { x: 20, y: 50 },
        { x: 50, y: 50 },
        { x: 80, y: 50 }
      ];
    }
    if (count === 5) {
      return [
        { x: 50, y: 50 },
        { x: 18, y: 18 },
        { x: 82, y: 18 },
        { x: 18, y: 82 },
        { x: 82, y: 82 }
      ];
    }
    return [
      { x: 14, y: 16 }, { x: 50, y: 16 }, { x: 86, y: 16 },
      { x: 14, y: 50 }, { x: 50, y: 50 }, { x: 86, y: 50 },
      { x: 14, y: 84 }, { x: 50, y: 84 }, { x: 86, y: 84 }
    ].slice(0, count);
  }

  function setWebgazerDisplay(showVideo, showPrediction) {
    if (!window.webgazer) {
      return;
    }
    webgazer.showVideo(showVideo === true);
    webgazer.showFaceOverlay(showVideo === true);
    webgazer.showFaceFeedbackBox(showVideo === true);
    webgazer.showPredictionPoints(showPrediction === true);
  }

  function handlePrediction(data, elapsedTime) {
    var now = performance.now();
    var valid = data && Number.isFinite(data.x) && Number.isFinite(data.y);
    state.latestPrediction = valid ? { x: data.x, y: data.y, t: now } : null;

    if (state.validationCollector && state.latestPrediction) {
      var dx = state.latestPrediction.x - state.validationCollector.targetX;
      var dy = state.latestPrediction.y - state.validationCollector.targetY;
      state.validationCollector.samples.push({
        x: state.latestPrediction.x,
        y: state.latestPrediction.y,
        distance_px: Math.sqrt(dx * dx + dy * dy),
        t_ms: now - state.validationCollector.startedAt
      });
    }

    if (!state.activeTrial) {
      return;
    }

    var sample = {
      subject_id: state.participantId,
      trial_uid: state.activeTrial.uid,
      phase: state.activeTrial.phase,
      trial_index: state.activeTrial.trialIndex,
      pair_index: state.activeTrial.row ? state.activeTrial.row.pair_index : "",
      unique_gamble_id: state.activeTrial.row ? state.activeTrial.row.unique_gamble_id : "",
      gain: state.activeTrial.row ? state.activeTrial.row.gain : "",
      loss: state.activeTrial.row ? state.activeTrial.row.loss : "",
      gain_on_left: state.activeTrial.row ? state.activeTrial.row.GainOnLeft : "",
      fontsize_condition: state.activeTrial.row ? state.activeTrial.row.Fontsize : "",
      sample_index: state.activeSamples.length + 1,
      t_ms: Math.round((now - state.activeTrial.startedAt) * 10) / 10,
      webgazer_elapsed_ms: Number.isFinite(elapsedTime) ? Math.round(elapsedTime * 10) / 10 : "",
      x_px: valid ? Math.round(data.x * 100) / 100 : "",
      y_px: valid ? Math.round(data.y * 100) / 100 : "",
      x_norm: valid ? Math.round((data.x / window.innerWidth) * 1000000) / 1000000 : "",
      y_norm: valid ? Math.round((data.y / window.innerHeight) * 1000000) / 1000000 : "",
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      valid: valid ? 1 : 0,
      aoi: valid ? classifyAoi(data.x, data.y) : "invalid"
    };
    state.activeSamples.push(sample);
    state.allSamples.push(sample);
  }

  function classifyAoi(x, y) {
    var elements = document.elementsFromPoint(x, y);
    for (var i = 0; i < elements.length; i += 1) {
      var el = elements[i];
      if (el.dataset && el.dataset.eyeAoi) {
        return el.dataset.eyeAoi;
      }
      if (el.closest) {
        var target = el.closest("[data-eye-aoi]");
        if (target && target.dataset.eyeAoi) {
          return target.dataset.eyeAoi;
        }
      }
    }
    return "other_screen";
  }

  async function initializeWebgazer() {
    if (state.initialized) {
      webgazer.resume();
      return;
    }
    if (!window.webgazer) {
      throw new Error("WebGazer 没有加载成功。");
    }
    if (!window.isSecureContext) {
      throw new Error("浏览器只允许在 HTTPS 或 localhost 中使用摄像头。");
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw new Error("当前浏览器不支持实验所需的摄像头接口。");
    }

    await new Promise(function (resolve, reject) {
      var settled = false;
      var timeout = window.setTimeout(function () {
        if (!settled) {
          settled = true;
          reject(new Error("摄像头启动超时。"));
        }
      }, 20000);

      webgazer.begin(function (error) {
        if (settled) {
          return;
        }
        if (error) {
          settled = true;
          window.clearTimeout(timeout);
          reject(error);
          return;
        }
        var started = performance.now();
        var timer = window.setInterval(function () {
          if (webgazer.isReady && webgazer.isReady()) {
            settled = true;
            window.clearInterval(timer);
            window.clearTimeout(timeout);
            resolve();
          } else if (performance.now() - started > 18000) {
            settled = true;
            window.clearInterval(timer);
            window.clearTimeout(timeout);
            reject(new Error("摄像头已打开，但 WebGazer 没有检测到可用视频帧。"));
          }
        }, 100);
      });
    });

    webgazer.setRegression("threadedRidge");
    webgazer.setGazeListener(handlePrediction);
    if (typeof webgazer.removeMouseEventListeners === "function") {
      webgazer.removeMouseEventListeners();
    }
    state.initialized = true;
    setWebgazerDisplay(true, false);
  }

  function cameraErrorMessage(error) {
    var name = error && error.name ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "你拒绝了摄像头权限。请在浏览器地址栏允许本网页使用摄像头，然后重试。";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "没有检测到可用摄像头。请连接或启用摄像头后重试。";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "摄像头可能正被其他软件占用。请关闭占用摄像头的软件后重试。";
    }
    return error && error.message ? error.message : String(error || "摄像头启动失败。");
  }

  async function startTutorialWebgazer(displayElement) {
    displayElement.innerHTML =
      '<div class="eye-tutorial-message"> Before you begin the calibration, please wait until the video feed appears on your screen. <br></br> Follow the previous tips to adjust your position relative to your webcam. <br></br> When you are ready, please press the <b>SPACE BAR</b> to continue.</div>';
    try {
      await initializeWebgazer();
    } catch (error) {
      console.error(error);
      window.alert("Error: cannot start webgazer.\nIs webcam blocked? This app needs webcam.");
      window.location.reload();
      return false;
    }
    webgazer.showFaceOverlay(true);
    webgazer.showFaceFeedbackBox(true);
    webgazer.showVideo(true);
    await waitForSpace();
    return true;
  }

  async function calibrateLikeTutorial(displayElement, options) {
    var numPoints = options.numPoints || 6;
    var duration = options.duration || 10;
    var showPoint = options.showPoint || false;
    var doVideo = options.doVideo !== undefined ? options.doVideo : true;
    var points = prepareTutorialReferencePoints(numPoints);
    var data = { history: [] };

    displayElement.innerHTML = '<div id="calibration_dot"><div id="calibration_cnt">0</div></div>';
    var calibrationDot = document.getElementById("calibration_dot");
    var calibrationCnt = document.getElementById("calibration_cnt");
    calibrationDot.style.display = "none";

    if (typeof webgazer.clearData === "function") {
      webgazer.clearData();
    }
    webgazer.showPredictionPoints(showPoint);
    webgazer.showVideo(doVideo);
    webgazer.showFaceOverlay(doVideo);
    webgazer.showFaceFeedbackBox(doVideo);

    await wait(1000);
    calibrationDot.style.display = "block";

    while (points.length > 0) {
      var point = points.pop();
      calibrationCnt.textContent = duration;
      calibrationDot.style.left = point.x;
      calibrationDot.style.top = point.y;
      var rect = calibrationDot.getBoundingClientRect();
      var cx = parseInt(Math.round(rect.left), 10);
      var cy = parseInt(Math.round(rect.top), 10);

      var trainer = null;
      window.setTimeout(function () {
        trainer = window.setInterval(function () {
          if (typeof webgazer.watchListener === "function") {
            webgazer.watchListener(cx, cy);
          } else if (typeof webgazer.recordScreenPosition === "function") {
            webgazer.recordScreenPosition(cx, cy, "click");
          }
        }, 5);
      }, 800);

      var logger = window.setInterval(function () {
        var pos = typeof webgazer.getCurrentPrediction === "function" ? webgazer.getCurrentPrediction() : null;
        if (pos) {
          var dist = vectorLength(pos.x - cx, pos.y - cy);
          data.history.push({
            x: pos.x,
            y: pos.y,
            cx: cx,
            cy: cy,
            dist: dist,
            count: calibrationCnt.textContent
          });
        }
      }, 100);

      var counter = window.setInterval(function () {
        calibrationCnt.textContent = Number(calibrationCnt.textContent) - 1;
      }, 1000);

      await wait(duration * 1000);
      window.clearInterval(trainer);
      window.clearInterval(logger);
      window.clearInterval(counter);
    }

    displayElement.innerHTML = "";
    webgazer.showPredictionPoints(showPoint);
    return data;
  }

  async function validateLikeTutorial(displayElement, options) {
    var numPoints = options.numPoints || 6;
    var duration = options.duration || 10;
    var showPoint = options.showPoint || false;
    var tol = options.tol || 200;
    var threshold = options.threshold || 0.7;
    var doVideo = options.doVideo || false;
    var points = prepareTutorialReferencePoints(numPoints);
    var data = { points: [], history: [] };

    displayElement.innerHTML = '<div id="validation_dot"><div id="validation_cnt">0</div></div>';
    var validationDot = document.getElementById("validation_dot");
    var validationCnt = document.getElementById("validation_cnt");
    validationDot.style.display = "none";

    if (typeof webgazer.clearData === "function") {
      webgazer.clearData();
    }
    webgazer.showPredictionPoints(showPoint);
    webgazer.showVideo(doVideo);
    webgazer.showFaceOverlay(doVideo);
    webgazer.showFaceFeedbackBox(doVideo);

    await wait(1000);
    validationDot.style.display = "block";

    while (points.length > 0) {
      var point = points.pop();
      validationDot.style.left = point.x;
      validationDot.style.top = point.y;
      validationCnt.textContent = duration;
      var rect = validationDot.getBoundingClientRect();
      var cx = parseInt(Math.round(rect.left), 10);
      var cy = parseInt(Math.round(rect.top), 10);
      var hitCount = 0;
      var totalCount = 0;

      var tester = null;
      window.setTimeout(function () {
        tester = window.setInterval(function () {
          var pos = typeof webgazer.getCurrentPrediction === "function" ? webgazer.getCurrentPrediction() : null;
          if (!pos) {
            return;
          }
          var dist = vectorLength(pos.x - cx, pos.y - cy);
          if (dist < tol) {
            hitCount += 1;
          }
          totalCount += 1;
        }, 10);
      }, 500);

      var logger = window.setInterval(function () {
        var pos = typeof webgazer.getCurrentPrediction === "function" ? webgazer.getCurrentPrediction() : null;
        if (pos) {
          var dist = vectorLength(pos.x - cx, pos.y - cy);
          data.history.push({
            x: pos.x,
            y: pos.y,
            cx: cx,
            cy: cy,
            dist: dist,
            count: validationCnt.textContent
          });
        }
      }, 50);

      var counter = window.setInterval(function () {
        validationCnt.textContent = Number(validationCnt.textContent) - 1;
      }, 1000);

      await wait(duration * 1000);
      window.clearInterval(tester);
      window.clearInterval(logger);
      window.clearInterval(counter);

      var hitRatio = totalCount ? hitCount / totalCount : 0;
      var success = hitRatio > threshold;
      data.points.push({
        x: point.x,
        y: point.y,
        valid: success,
        hitRatio: hitRatio,
        hitCount: hitCount,
        totalcount: totalCount
      });
      validationDot.style.backgroundColor = success ? "green" : "yellow";
      await wait(1000);
      validationDot.style.backgroundColor = "#dd494b";
    }

    displayElement.innerHTML = "";
    webgazer.showPredictionPoints(showPoint);
    return data;
  }

  function computeTutorialAccuracy(validationPoints) {
    var points = validationPoints || [];
    if (!points.length) {
      return 1;
    }
    var count = points.filter(function (point) {
      return point.valid;
    }).length;
    return count / points.length;
  }

  function tutorialCalibrationTrial() {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: "",
      choices: "NO_KEYS",
      data: { phase: "eye_tracking_tutorial_calibration" },
      on_load: async function () {
        var displayElement = state.jsPsych.getDisplayElement();
        state.calibrationAttempts += 1;
        var started = await startTutorialWebgazer(displayElement);
        if (!started) {
          return;
        }
        var calibrationData = await calibrateLikeTutorial(displayElement, {
          numPoints: config.tutorialCalibrationPoints,
          duration: config.tutorialCalibrationDurationSec,
          showPoint: false,
          doVideo: true
        });
        await wait(1000);
        displayElement.innerHTML = '<div class="eye-tutorial-message">Validation starts. Press the spacebar to begin. </div>';
        await waitForSpace();
        var validationData = await validateLikeTutorial(displayElement, {
          numPoints: config.tutorialValidationPoints,
          duration: config.tutorialValidationDurationSec,
          showPoint: false,
          tol: config.tutorialValidationTolPx,
          threshold: config.tutorialValidationThreshold,
          doVideo: false
        });
        var accuracy = computeTutorialAccuracy(validationData.points);
        state.validationPassed = accuracy >= config.tutorialValidationThreshold;
        state.validationSummary = {
          eye_validation_passed: state.validationPassed ? 1 : 0,
          eye_validation_accuracy: Math.round(accuracy * 10000) / 10000,
          eye_calibration_attempts: state.calibrationAttempts
        };
        state.jsPsych.data.addProperties(state.validationSummary);
        state.jsPsych.finishTrial({
          calibration_attempt: state.calibrationAttempts,
          validationPoints: JSON.stringify(validationData.points),
          accuracy: accuracy,
          validationnHistory: JSON.stringify(validationData.history),
          calibrationHistory: JSON.stringify(calibrationData.history)
        });
      }
    };
  }

  async function waitForCenterFixation(holdMs, radiusPx, timeoutMs) {
    var requiredHold = Number.isFinite(holdMs) ? holdMs : config.centerFixationHoldMs;
    var radius = Number.isFinite(radiusPx) ? radiusPx : config.centerFixationRadiusPx;
    var timeout = Number.isFinite(timeoutMs) ? timeoutMs : config.centerFixationTimeoutMs;
    var centerX = window.innerWidth / 2;
    var centerY = window.innerHeight / 2;
    var startedAt = performance.now();
    var fixationStart = null;
    var samples = 0;

    while (performance.now() - startedAt < timeout) {
      var prediction = state.latestPrediction;
      samples += 1;
      if (prediction && vectorLength(prediction.x - centerX, prediction.y - centerY) <= radius) {
        if (fixationStart === null) {
          fixationStart = performance.now();
        }
        if (performance.now() - fixationStart >= requiredHold) {
          return {
            fixation_acquired: 1,
            fixation_wait_ms: Math.round(performance.now() - startedAt),
            fixation_sample_count: samples
          };
        }
      } else {
        fixationStart = null;
      }
      await wait(10);
    }

    return {
      fixation_acquired: 0,
      fixation_wait_ms: Math.round(performance.now() - startedAt),
      fixation_sample_count: samples
    };
  }

  function stopWebgazer() {
    state.activeTrial = null;
    state.validationCollector = null;
    if (!window.webgazer) {
      return;
    }
    setWebgazerDisplay(false, false);
    try {
      if (typeof webgazer.clearGazeListener === "function") {
        webgazer.clearGazeListener();
      }
    } catch (error) {}
    try {
      if (typeof webgazer.stopVideo === "function") {
        webgazer.stopVideo();
      }
    } catch (error) {}
    try {
      webgazer.end();
    } catch (error) {}
    state.initialized = false;
  }

  function eyeInstructionTrial() {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div class="eye-page"><div class="eye-card">' +
          '<h1>眼动记录说明</h1>' +
          '<p>本实验会使用你的摄像头估计你在屏幕上的注视位置。摄像头画面只在浏览器本地处理，实验只记录带时间戳的屏幕坐标和校准质量，不保存或上传视频图像。</p>' +
          '<ul>' +
            '<li>请坐在光线均匀的位置，脸部不要被强光、帽檐或头发遮挡。</li>' +
            '<li>请让眼睛与屏幕大致保持 50-70 厘米距离，脸保持在摄像头预览框中央。</li>' +
            '<li>校准和正式任务期间请尽量保持头部稳定，不要前后移动、左右歪头或频繁改变坐姿。</li>' +
            '<li>如果必须调整姿势，请缓慢移动，调整后重新把脸放回预览框中央，再继续注视屏幕。</li>' +
            '<li>正式任务期间请不要说话、看手机或看向屏幕外。</li>' +
          '</ul>' +
          '<p class="eye-muted">接下来会先启动摄像头，然后进行自动校准。校准时只需要看着屏幕上的圆点，不需要点击。</p>' +
          '<button id="eye-continue" class="eye-btn" type="button">我明白了，继续</button>' +
        '</div></div>',
      choices: "NO_KEYS",
      data: { phase: "eye_instruction" },
      on_load: function () {
        document.getElementById("eye-continue").addEventListener("click", function () {
          state.jsPsych.finishTrial();
        });
      }
    };
  }

  function cameraSetupTrial() {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div class="eye-page"><div class="eye-card">' +
          '<h1>启动摄像头</h1>' +
          '<p>请点击按钮并在浏览器弹窗中允许摄像头权限。启动后，你会在右下角看到摄像头预览。</p>' +
          '<p>请调整坐姿，让脸部位于预览框中央；之后在校准和任务期间尽量保持这个位置。</p>' +
          '<button id="eye-camera-btn" class="eye-btn" type="button">启动摄像头</button>' +
          '<p id="eye-camera-status" class="eye-muted"></p>' +
        '</div></div>',
      choices: "NO_KEYS",
      data: { phase: "eye_camera_setup" },
      on_load: function () {
        var button = document.getElementById("eye-camera-btn");
        var status = document.getElementById("eye-camera-status");
        var ready = false;
        button.addEventListener("click", async function () {
          if (ready) {
            state.jsPsych.finishTrial({ eye_camera_ready: 1 });
            return;
          }
          button.disabled = true;
          status.className = "eye-muted";
          status.textContent = "正在启动摄像头。请在浏览器提示中选择允许。";
          try {
            await initializeWebgazer();
            ready = true;
            button.textContent = "继续校准";
            button.disabled = false;
            status.textContent = "摄像头已启动。请确认脸部在右下角预览框中央，然后继续。";
          } catch (error) {
            console.error(error);
            button.textContent = "重试摄像头";
            button.disabled = false;
            status.className = "eye-warning";
            status.textContent = cameraErrorMessage(error);
          }
        });
      }
    };
  }

  function calibrationIntroTrial(kind) {
    var isFinal = kind === "final";
    var title = isFinal ? "正式任务前三点快速校准" : "自动眼动校准";
    var details = isFinal
      ? "接下来有 3 个校准点，每个点大约停留 1 秒多。请只看圆点中心，不需要点击。"
      : "接下来先进行 9 点自动校准，每个红点大约停留 1 秒多；之后会出现 5 个蓝点用于检测校准质量。如果检测结果不理想，系统会自动再校准一次，最多 2 轮。";
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div class="eye-page"><div class="eye-card">' +
          '<h1>' + title + '</h1>' +
          '<p>' + details + '</p>' +
          '<ul>' +
            '<li>圆点出现在哪里，就把视线稳定放在哪里。</li>' +
            '<li>不要用鼠标点击圆点，也不要追着圆点移动头部。</li>' +
            '<li>请保持头部稳定，只移动眼睛注视圆点。</li>' +
          '</ul>' +
          '<button id="eye-calibration-start" class="eye-btn" type="button">开始</button>' +
        '</div></div>',
      choices: "NO_KEYS",
      data: { phase: isFinal ? "eye_final_calibration_intro" : "eye_calibration_intro" },
      on_load: function () {
        document.getElementById("eye-calibration-start").addEventListener("click", function () {
          state.jsPsych.finishTrial();
        });
      }
    };
  }

  function autoCalibrationTrial(kind) {
    var count = kind === "final" ? config.finalCalibrationPoints : config.initialCalibrationPoints;
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div class="eye-stage">' +
          '<div class="eye-stage-note">请注视红点中心。无需点击。<br><span id="eye-progress"></span></div>' +
          '<div id="eye-point" class="eye-point eye-point-calibration"></div>' +
        '</div>',
      choices: "NO_KEYS",
      data: { phase: kind === "final" ? "eye_final_auto_calibration" : "eye_auto_calibration" },
      on_load: async function () {
        var points = getPointPositions(count);
        var point = document.getElementById("eye-point");
        var progress = document.getElementById("eye-progress");
        if (kind !== "final") {
          state.calibrationAttempts += 1;
        }
        await initializeWebgazer();
        setWebgazerDisplay(false, false);
        if (kind !== "final" && typeof webgazer.clearData === "function") {
          webgazer.clearData();
        }

        for (var i = 0; i < points.length; i += 1) {
          point.style.left = points[i].x + "%";
          point.style.top = points[i].y + "%";
          progress.textContent = "校准点 " + (i + 1) + " / " + points.length;
          await wait(config.calibrationSettleMs);
          var rect = point.getBoundingClientRect();
          var x = rect.left + rect.width / 2;
          var y = rect.top + rect.height / 2;
          var start = performance.now();
          while (performance.now() - start < config.calibrationSampleMs) {
            if (typeof webgazer.recordScreenPosition === "function") {
              webgazer.recordScreenPosition(x, y, "click");
            }
            await wait(config.calibrationSampleIntervalMs);
          }
        }
        state.jsPsych.finishTrial({
          calibration_kind: kind,
          calibration_attempt: state.calibrationAttempts,
          calibration_point_count: points.length,
          calibration_click_required: 0
        });
      }
    };
  }

  function validationTrial() {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div class="eye-stage">' +
          '<div class="eye-stage-note">正在检测校准质量。请注视蓝点中心。<br><span id="eye-validation-progress"></span></div>' +
          '<div id="eye-validation-point" class="eye-point eye-point-validation"></div>' +
        '</div>',
      choices: "NO_KEYS",
      data: { phase: "eye_validation" },
      on_load: async function () {
        var points = getPointPositions(config.validationPoints);
        var point = document.getElementById("eye-validation-point");
        var progress = document.getElementById("eye-validation-progress");
        var results = [];
        await initializeWebgazer();
        setWebgazerDisplay(false, false);

        for (var i = 0; i < points.length; i += 1) {
          point.style.left = points[i].x + "%";
          point.style.top = points[i].y + "%";
          progress.textContent = "检测点 " + (i + 1) + " / " + points.length;
          await wait(config.validationSettleMs);
          var rect = point.getBoundingClientRect();
          state.validationCollector = {
            targetX: rect.left + rect.width / 2,
            targetY: rect.top + rect.height / 2,
            startedAt: performance.now(),
            samples: []
          };
          await wait(config.validationSampleMs);
          var samples = state.validationCollector.samples.slice();
          state.validationCollector = null;
          var hits = samples.filter(function (sample) {
            return sample.distance_px <= config.validationTolerancePx;
          }).length;
          results.push({
            point_index: i + 1,
            sample_count: samples.length,
            hit_count: hits,
            hit_ratio: samples.length ? hits / samples.length : 0
          });
        }

        var totalSamples = results.reduce(function (sum, item) { return sum + item.sample_count; }, 0);
        var totalHits = results.reduce(function (sum, item) { return sum + item.hit_count; }, 0);
        var ratio = totalSamples ? totalHits / totalSamples : 0;
        state.validationPassed = ratio >= config.validationPassRatio;
        state.validationSummary = {
          eye_validation_passed: state.validationPassed ? 1 : 0,
          eye_validation_hit_ratio: Math.round(ratio * 10000) / 10000,
          eye_validation_sample_count: totalSamples,
          eye_calibration_attempts: state.calibrationAttempts
        };
        state.jsPsych.data.addProperties(state.validationSummary);
        state.jsPsych.finishTrial({
          calibration_attempt: state.calibrationAttempts,
          validation_passed: state.validationPassed ? 1 : 0,
          validation_hit_ratio: Math.round(ratio * 10000) / 10000,
          validation_sample_count: totalSamples,
          validation_points_json: JSON.stringify(results)
        });
      }
    };
  }

  function calibrationRepeatNoticeTrial() {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div class="eye-page"><div class="eye-card">' +
          '<h1>需要再校准一次</h1>' +
          '<p>刚才的检测质量没有达到预设标准。请重新把脸放在摄像头预览框中央，保持头部稳定，再进行一次自动校准。</p>' +
          '<button id="eye-repeat" class="eye-btn" type="button">重新校准</button>' +
        '</div></div>',
      choices: "NO_KEYS",
      data: { phase: "eye_calibration_repeat_notice" },
      on_load: function () {
        document.getElementById("eye-repeat").addEventListener("click", function () {
          state.jsPsych.finishTrial();
        });
      }
    };
  }

  function calibrationLowQualityNoticeTrial() {
    return {
      timeline: [{
        type: jsPsychHtmlKeyboardResponse,
        stimulus:
          '<div class="eye-page"><div class="eye-card">' +
            '<h1>校准完成</h1>' +
            '<p class="eye-warning">校准质量没有达到最佳标准，但实验仍会继续记录眼动数据。</p>' +
            '<p>正式任务中请继续保持头部稳定、脸在预览框中央，并专注看屏幕。</p>' +
            '<button id="eye-low-quality" class="eye-btn" type="button">继续</button>' +
          '</div></div>',
        choices: "NO_KEYS",
        data: { phase: "eye_low_quality_notice" },
        on_load: function () {
          document.getElementById("eye-low-quality").addEventListener("click", function () {
            state.jsPsych.finishTrial();
          });
        }
      }],
      conditional_function: function () {
        return !state.validationPassed;
      }
    };
  }

  function initialCalibrationBlock() {
    return {
      timeline: [
        autoCalibrationTrial("initial"),
        validationTrial(),
        {
          timeline: [calibrationRepeatNoticeTrial()],
          conditional_function: function () {
            return !state.validationPassed && state.calibrationAttempts < config.maxCalibrationAttempts;
          }
        }
      ],
      loop_function: function () {
        return !state.validationPassed && state.calibrationAttempts < config.maxCalibrationAttempts;
      }
    };
  }

  function startTrial(row, phaseName, trialIndex) {
    state.activeSamples = [];
    state.activeTrial = {
      uid: phaseName + "_" + trialIndex + "_" + Date.now(),
      phase: phaseName,
      trialIndex: trialIndex,
      row: row,
      startedAt: performance.now()
    };
    if (state.initialized) {
      webgazer.resume();
      setWebgazerDisplay(false, false);
    }
  }

  function stopTrial() {
    var duration = state.activeTrial ? performance.now() - state.activeTrial.startedAt : 0;
    var samples = state.activeSamples.slice();
    state.activeTrial = null;
    var valid = samples.filter(function (sample) { return sample.valid === 1; });
    var intervals = [];
    for (var i = 1; i < samples.length; i += 1) {
      intervals.push(samples[i].t_ms - samples[i - 1].t_ms);
    }
    var aoiCounts = valid.reduce(function (counts, sample) {
      counts[sample.aoi] = (counts[sample.aoi] || 0) + 1;
      return counts;
    }, {});
    return {
      eye_sample_count: samples.length,
      eye_valid_sample_count: valid.length,
      eye_duration_ms: Math.round(duration),
      eye_effective_hz: duration > 0 ? Math.round((samples.length / duration) * 100000) / 100 : 0,
      eye_median_interval_ms: intervals.length ? Math.round(intervals.slice().sort(function (a, b) { return a - b; })[Math.floor(intervals.length / 2)] * 10) / 10 : "",
      eye_aoi_counts_json: JSON.stringify(aoiCounts),
      eye_samples_json: JSON.stringify(samples)
    };
  }

  function rowsToCsv(rows, columns) {
    function escapeCsv(value) {
      if (value === undefined || value === null) {
        return "";
      }
      var text = String(value);
      return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }
    return [
      columns.map(escapeCsv).join(",")
    ].concat(rows.map(function (row) {
      return columns.map(function (column) {
        return escapeCsv(row[column]);
      }).join(",");
    })).join("\n");
  }

  function getGazeCsv() {
    var columns = [
      "subject_id", "trial_uid", "phase", "trial_index", "pair_index", "unique_gamble_id",
      "gain", "loss", "gain_on_left", "fontsize_condition", "sample_index", "t_ms",
      "webgazer_elapsed_ms", "x_px", "y_px", "x_norm", "y_norm", "viewport_width",
      "viewport_height", "valid", "aoi"
    ];
    return rowsToCsv(state.allSamples, columns);
  }

  window.GambleEyeTracking = {
    init: init,
    eyeInstructionTrial: eyeInstructionTrial,
    cameraSetupTrial: cameraSetupTrial,
    calibrationIntroTrial: calibrationIntroTrial,
    initialCalibrationBlock: initialCalibrationBlock,
    calibrationLowQualityNoticeTrial: calibrationLowQualityNoticeTrial,
    autoCalibrationTrial: autoCalibrationTrial,
    tutorialCalibrationTrial: tutorialCalibrationTrial,
    waitForCenterFixation: waitForCenterFixation,
    startTrial: startTrial,
    stopTrial: stopTrial,
    stopWebgazer: stopWebgazer,
    getGazeCsv: getGazeCsv,
    state: state
  };
})();
