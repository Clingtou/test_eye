/*
  Experiment 1 eye-tracking version: ultimatum game receiver decision with polar-area pie displays.
  Replace PROLIFIC_COMPLETION_CODE before launching on Prolific.
*/

const DATAPIPE_EXPERIMENT_ID = "HJEtzT3h5x8N";
const PROLIFIC_COMPLETION_CODE = "REPLACE_WITH_PROLIFIC_COMPLETION_CODE";
const BASE_PAYMENT_USD = 1.00;
const BONUS_DRAW_PERCENT = 10;
const RADIUS_MANIPULATION_RATIO = 1.3;
const WEBGAZER_CALIBRATION_POINTS = 9;
const WEBGAZER_CLICKS_PER_POINT = 5;
const WEBGAZER_FINAL_CALIBRATION_POINTS = 3;
const WEBGAZER_FINAL_CLICKS_PER_POINT = 3;
const WEBGAZER_VALIDATION_POINTS = 9;
const WEBGAZER_VALIDATION_TOLERANCE_PX = 150;
const WEBGAZER_VALIDATION_PASS_RATIO = 0.70;
const WEBGAZER_MAX_CALIBRATION_ATTEMPTS = 3;
const WEBGAZER_VALIDATION_SETTLE_MS = 350;
const WEBGAZER_VALIDATION_SAMPLE_MS = 1000;
const STUDY_TITLE = "Decision-Making Study";
document.title = STUDY_TITLE;

const YOU_ORANGE = "#f28e2b";
const OTHER_BLUE = "#6ea8ff";

const jsPsych = initJsPsych({
  use_webaudio: false,
  on_finish: function () {
    console.log("Final jsPsych behavior CSV:", getFilteredDataCsv());
    console.log("Final WebGazer gaze CSV:", getGazeDataCsv());
  }
});

const experimentStartPerf = performance.now();
let fullscreenAbortArmed = false;
let plannedFullscreenExit = false;
let comprehensionAttempts = 0;
let comprehensionPassed = false;
let excludedForComprehension = false;
let webgazerInitialized = false;
let webgazerCameraFailed = false;
let eyeCalibrationAttempts = 0;
let eyeValidationPassed = false;
let eyeValidationCollector = null;
let decisionGazeActive = false;
let decisionGazeStartPerf = null;
let decisionGazeStartEpochMs = null;
let decisionGazeCondition = null;
let latestGazePrediction = null;
const gazeSamples = [];

function currentFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;
}

const prolific_pid = jsPsych.data.getURLVariable("PROLIFIC_PID") || "missing";
const study_id = jsPsych.data.getURLVariable("STUDY_ID") || "missing";
const session_id = jsPsych.data.getURLVariable("SESSION_ID") || jsPsych.randomization.randomID(12);
const subject_id = prolific_pid !== "missing" ? prolific_pid : jsPsych.randomization.randomID(10);
const file_timestamp = Date.now();
const data_filename = `${subject_id}_${session_id}_${file_timestamp}_ultimatum_exp1_eye_behavior.csv`;
const gaze_filename = `${subject_id}_${session_id}_${file_timestamp}_ultimatum_exp1_eye_gaze.csv`;
const preview_mode = jsPsych.data.getURLVariable("preview") === "1" || prolific_pid === "missing";
const studyLockKey = `ultimatum_exp1_eye_status_${prolific_pid}_${study_id}`;

function desktopCheck() {
  const ua = navigator.userAgent || "";
  const mobileLike = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const smallWindow = window.innerWidth < 900 || window.innerHeight < 600;
  return {
    pass: !mobileLike && !smallWindow,
    mobileLike,
    smallWindow,
    windowInnerWidth: window.innerWidth,
    windowInnerHeight: window.innerHeight
  };
}

const device = desktopCheck();

jsPsych.data.addProperties({
  Subject: subject_id,
  prolific_pid: prolific_pid,
  study_id: study_id,
  session_id: session_id,
  data_filename: data_filename,
  gaze_filename: gaze_filename,
  datapipe_experiment_id: DATAPIPE_EXPERIMENT_ID,
  screen_width: window.screen.width,
  screen_height: window.screen.height,
  device_check_pass: device.pass ? 1 : 0,
  device_mobile_like: device.mobileLike ? 1 : 0,
  device_small_window: device.smallWindow ? 1 : 0,
  timezone_offset_minutes: new Date().getTimezoneOffset(),
  eye_tracking_version: "webgazer_native_callback_v1",
  eye_validation_tolerance_px: WEBGAZER_VALIDATION_TOLERANCE_PX,
  eye_validation_pass_ratio: WEBGAZER_VALIDATION_PASS_RATIO
});

function shellHtml(innerHtml, topTitle = STUDY_TITLE, extraClass = "") {
  return `
    <div class="study-shell ${extraClass}">
      <div class="qualtrics-topbar">${topTitle}</div>
      <div class="qualtrics-card">${innerHtml}</div>
    </div>
  `;
}

function getStoredStudyStatus() {
  if (preview_mode) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(studyLockKey);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function setStoredStudyStatus(status) {
  if (preview_mode) {
    return;
  }
  try {
    window.localStorage.setItem(studyLockKey, JSON.stringify({
      status: status,
      timestamp: Date.now(),
      prolific_pid: prolific_pid,
      study_id: study_id
    }));
  } catch (error) {
    // If localStorage is unavailable, continue without browser-side locking.
  }
}

function lockedStatusTrial(statusRecord) {
  const status = statusRecord && statusRecord.status;
  const completed = status === "completed";
  const message = completed
    ? "Your response has already been saved."
    : "You are not eligible to continue this study.";
  const detail = completed
    ? "Thank you for completing this study."
    : "Please return this study on Prolific. Do not submit a completion code.";
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">${completed ? "Your response has been saved." : "The study has ended."}</h2>
      <p class="${completed ? "" : "warning"}">${message}</p>
      <p>${detail}</p>
      ${completed && isCompletionCodeConfigured()
        ? `<p>Click the button below to return to Prolific.</p>`
        : ""}
    `, STUDY_TITLE, completed ? "" : "abort-shell"),
    choices: [completed && isCompletionCodeConfigured() ? "Return to Prolific" : "Exit"],
    data: { phase: "locked_status", locked_status: status || "unknown" },
    on_finish: function () {
      if (completed && isCompletionCodeConfigured()) {
        window.location.href = `https://app.prolific.com/submissions/complete?cc=${PROLIFIC_COMPLETION_CODE}`;
      }
    }
  };
}

function handleFullscreenChange() {
  if (fullscreenAbortArmed && !plannedFullscreenExit && !currentFullscreenElement()) {
    stopWebgazer();
    const storedStatus = getStoredStudyStatus();
    if (storedStatus && storedStatus.status === "completed") {
      fullscreenAbortArmed = false;
      if (isCompletionCodeConfigured()) {
        window.location.href = `https://app.prolific.com/submissions/complete?cc=${PROLIFIC_COMPLETION_CODE}`;
      } else {
        jsPsych.endExperiment(lockedStatusTrial(storedStatus).stimulus);
      }
      return;
    }
    setStoredStudyStatus("fullscreen_exit");
    fullscreenAbortArmed = false;
    jsPsych.data.addProperties({
      fullscreen_exit_abort: 1,
      fullscreen_exit_abort_time_ms: Math.round(performance.now() - experimentStartPerf)
    });
    jsPsych.endExperiment(shellHtml(`
      <h2 class="intro-title">The study has ended.</h2>
      <p class="warning">You exited fullscreen mode during the study.</p>
      <p>Please return this study on Prolific. Do not submit a completion code.</p>
    `, STUDY_TITLE, "abort-shell"));
  }
}

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
document.addEventListener("mozfullscreenchange", handleFullscreenChange);
document.addEventListener("MSFullscreenChange", handleFullscreenChange);

function setWebgazerDisplay(options = {}) {
  if (!window.webgazer) {
    return;
  }
  const showVideo = options.video === true;
  const showPrediction = options.prediction === true;
  webgazer.showVideo(showVideo);
  webgazer.showFaceOverlay(showVideo);
  webgazer.showFaceFeedbackBox(showVideo);
  webgazer.showPredictionPoints(showPrediction);
}

function classifyGazeAoi(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return "invalid";
  }
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    const target = element.closest ? element.closest("[data-eye-aoi]") : null;
    if (target && target.dataset.eyeAoi) {
      return target.dataset.eyeAoi;
    }
  }
  return "other_page";
}

function handleWebgazerPrediction(data, webgazerElapsedTime) {
  const nowPerf = performance.now();
  latestGazePrediction = data && Number.isFinite(data.x) && Number.isFinite(data.y)
    ? { x: data.x, y: data.y, received_perf_ms: nowPerf }
    : null;

  if (eyeValidationCollector && latestGazePrediction) {
    const dx = latestGazePrediction.x - eyeValidationCollector.targetX;
    const dy = latestGazePrediction.y - eyeValidationCollector.targetY;
    eyeValidationCollector.samples.push({
      x: latestGazePrediction.x,
      y: latestGazePrediction.y,
      distance_px: Math.sqrt(dx * dx + dy * dy),
      t_ms: nowPerf - eyeValidationCollector.startedPerf
    });
  }

  if (!decisionGazeActive || decisionGazeStartPerf === null) {
    return;
  }

  const valid = latestGazePrediction !== null;
  const x = valid ? latestGazePrediction.x : null;
  const y = valid ? latestGazePrediction.y : null;
  gazeSamples.push({
    subject_id: subject_id,
    session_id: session_id,
    trial_id: "ultimatum_decision",
    condition_index: decisionGazeCondition ? decisionGazeCondition.condition_index : "",
    condition_label: decisionGazeCondition ? decisionGazeCondition.condition_label : "",
    sample_index: gazeSamples.length + 1,
    t_ms: Math.round((nowPerf - decisionGazeStartPerf) * 10) / 10,
    webgazer_elapsed_ms: Number.isFinite(webgazerElapsedTime) ? Math.round(webgazerElapsedTime * 10) / 10 : "",
    trial_start_epoch_ms: decisionGazeStartEpochMs,
    x_px: valid ? Math.round(x * 100) / 100 : "",
    y_px: valid ? Math.round(y * 100) / 100 : "",
    x_norm: valid ? Math.round((x / window.innerWidth) * 1000000) / 1000000 : "",
    y_norm: valid ? Math.round((y / window.innerHeight) * 1000000) / 1000000 : "",
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    valid: valid ? 1 : 0,
    aoi: valid ? classifyGazeAoi(x, y) : "invalid"
  });
}

async function initializeWebgazer() {
  if (webgazerInitialized) {
    webgazer.resume();
    return;
  }
  if (!window.webgazer) {
    throw new Error("WebGazer failed to load.");
  }
  if (!window.isSecureContext) {
    throw new Error("Camera access requires HTTPS or localhost.");
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("This browser does not provide the camera API required by WebGazer.");
  }

  await new Promise(function (resolve, reject) {
    let settled = false;
    const timeout = window.setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error("WebGazer camera setup timed out."));
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
      const readyStarted = performance.now();
      const readyTimer = window.setInterval(function () {
        if (webgazer.isReady && webgazer.isReady()) {
          settled = true;
          window.clearInterval(readyTimer);
          window.clearTimeout(timeout);
          resolve();
        } else if (performance.now() - readyStarted > 18000) {
          settled = true;
          window.clearInterval(readyTimer);
          window.clearTimeout(timeout);
          reject(new Error("The webcam opened, but WebGazer could not detect video frames."));
        }
      }, 100);
    });
  });

  webgazer.setRegression("ridge");
  webgazer.setGazeListener(handleWebgazerPrediction);
  if (typeof webgazer.removeMouseEventListeners === "function") {
    webgazer.removeMouseEventListeners();
  }
  webgazerInitialized = true;
  setWebgazerDisplay({ video: true, prediction: false });
}

function cameraErrorMessage(error) {
  const name = error && error.name ? error.name : "";
  const message = error && error.message ? error.message : String(error || "Unknown camera error");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow camera access for this site in the browser address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No usable webcam was found. Connect or enable a webcam, then try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The webcam is already in use or unavailable. Close other apps using it, then try again.";
  }
  return message;
}

function stopWebgazer() {
  decisionGazeActive = false;
  eyeValidationCollector = null;
  if (!window.webgazer) {
    return;
  }
  setWebgazerDisplay({ video: false, prediction: false });
  try {
    if (typeof webgazer.clearGazeListener === "function") {
      webgazer.clearGazeListener();
    }
  } catch (error) {
    console.warn("WebGazer gaze listener could not be cleared.", error);
  }
  try {
    if (typeof webgazer.stopVideo === "function") {
      webgazer.stopVideo();
    }
  } catch (error) {
    console.warn("WebGazer video stream could not be stopped cleanly.", error);
  }
  try {
    webgazer.end();
  } catch (error) {
    console.warn("WebGazer could not be stopped cleanly.", error);
  }
  webgazerInitialized = false;
}

const splits = [
  { split_id: "you10_other90", you: 10, other: 90 },
  { split_id: "you20_other80", you: 20, other: 80 },
  { split_id: "you30_other70", you: 30, other: 70 },
  { split_id: "you40_other60", you: 40, other: 60 },
  { split_id: "you50_other50", you: 50, other: 50 }
];

const areaConditions = [
  { area_condition: "equal_radius", you_radius_multiplier: 1, other_radius_multiplier: 1 },
  { area_condition: "you_larger", you_radius_multiplier: RADIUS_MANIPULATION_RATIO, other_radius_multiplier: 1 },
  { area_condition: "other_larger", you_radius_multiplier: 1, other_radius_multiplier: RADIUS_MANIPULATION_RATIO }
];

const positions = [
  { position_condition: "top", center_angle_degrees: 0 },
  { position_condition: "right", center_angle_degrees: 90 },
  { position_condition: "bottom", center_angle_degrees: 180 },
  { position_condition: "left", center_angle_degrees: 270 }
];

const colorBalances = [
  { color_balance: "you_orange_other_blue", you_color: YOU_ORANGE, other_color: OTHER_BLUE },
  { color_balance: "you_blue_other_orange", you_color: OTHER_BLUE, other_color: YOU_ORANGE }
];

function buildConditionTable() {
  const rows = [];
  areaConditions.forEach(function (area) {
    splits.forEach(function (split) {
      positions.forEach(function (position) {
        colorBalances.forEach(function (colors) {
          rows.push({
            condition_index: rows.length,
            condition_label: `${area.area_condition}_${split.split_id}_${position.position_condition}_${colors.color_balance}`,
            ...area,
            ...split,
            ...position,
            ...colors
          });
        });
      });
    });
  });
  return rows;
}

const conditionTable = buildConditionTable();

function isDatapipeConfigured() {
  return DATAPIPE_EXPERIMENT_ID && !DATAPIPE_EXPERIMENT_ID.includes("REPLACE_WITH");
}

function isCompletionCodeConfigured() {
  return PROLIFIC_COMPLETION_CODE && !PROLIFIC_COMPLETION_CODE.includes("REPLACE_WITH");
}

async function getDatapipeCondition() {
  if (!isDatapipeConfigured()) {
    return {
      conditionNumber: Math.floor(Math.random() * conditionTable.length),
      source: "fallback_datapipe_not_configured"
    };
  }

  try {
    const condition = await jsPsychPipe.getCondition(DATAPIPE_EXPERIMENT_ID);
    const conditionNumber = Number(condition);
    if (Number.isInteger(conditionNumber) && conditionNumber >= 0 && conditionNumber < conditionTable.length) {
      return { conditionNumber, source: "datapipe" };
    }
    return {
      conditionNumber: Math.floor(Math.random() * conditionTable.length),
      source: "fallback_invalid_datapipe_condition"
    };
  } catch (error) {
    console.warn("DataPipe condition assignment failed. Falling back to random condition.", error);
    return {
      conditionNumber: Math.floor(Math.random() * conditionTable.length),
      source: "fallback_datapipe_error"
    };
  }
}

function polarToCartesian(cx, cy, radius, angleDegrees) {
  const angleRadians = (angleDegrees - 90) * Math.PI / 180.0;
  return {
    x: cx + radius * Math.cos(angleRadians),
    y: cy + radius * Math.sin(angleRadians)
  };
}

function sectorPath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", cx, cy,
    "L", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    "Z"
  ].join(" ");
}

function angleWithinArc(angle, startAngle, endAngle) {
  const span = endAngle - startAngle;
  for (let shift = -720; shift <= 720; shift += 360) {
    const candidate = angle + shift;
    if (candidate >= startAngle && candidate <= startAngle + span) {
      return true;
    }
  }
  return false;
}

function sectorBounds(cx, cy, radius, startAngle, endAngle) {
  const points = [
    { x: cx, y: cy },
    polarToCartesian(cx, cy, radius, startAngle),
    polarToCartesian(cx, cy, radius, endAngle)
  ];
  [0, 90, 180, 270].forEach(function (angle) {
    if (angleWithinArc(angle, startAngle, endAngle)) {
      points.push(polarToCartesian(cx, cy, radius, angle));
    }
  });
  return points.reduce(function (bounds, point) {
    return {
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y)
    };
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function mergeBounds(first, second) {
  return {
    minX: Math.min(first.minX, second.minX),
    maxX: Math.max(first.maxX, second.maxX),
    minY: Math.min(first.minY, second.minY),
    maxY: Math.max(first.maxY, second.maxY)
  };
}

function calloutTextHtml(x, y, label, amount, anchor = "middle", aoi = "allocation_label") {
  const lineGap = 40;
  return `
    <g class="callout-group" data-eye-aoi="${aoi}">
      <text class="callout-text" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="hanging">
        <tspan class="callout-person" x="${x}" y="${y}">${label}</tspan>
        <tspan class="callout-amount" x="${x}" y="${y + lineGap}">${amount} cents</tspan>
      </text>
    </g>
  `;
}

function roseChartHtml(condition, options = {}) {
  const compact = options.compact === true;
  const cx = 390;
  const baseCy = compact ? 250 : 382;
  const baseRadius = compact ? 108 : 124;
  const verticalGap = compact ? 48 : 30;
  const horizontalGap = compact ? 72 : 70;
  const lineGap = 40;
  const amountTextHeight = 25;
  const viewBoxHeight = compact ? 500 : 700;
  const formalGroupCenterY = viewBoxHeight / 2;
  const youRadius = baseRadius * condition.you_radius_multiplier;
  const otherRadius = baseRadius * condition.other_radius_multiplier;
  let cy = baseCy;
  const youAngle = condition.you / 100 * 360;
  const otherAngle = 360 - youAngle;
  const youStart = condition.center_angle_degrees - youAngle / 2;
  const youEnd = condition.center_angle_degrees + youAngle / 2;
  const otherStart = youEnd;
  const otherEnd = youEnd + otherAngle;
  const shapeBounds = mergeBounds(
    sectorBounds(0, 0, otherRadius, otherStart, otherEnd),
    sectorBounds(0, 0, youRadius, youStart, youEnd)
  );

  let labelHtml = "";
  if (condition.position_condition === "top" || condition.position_condition === "bottom") {
    const upper = condition.position_condition === "top"
      ? { label: "you", amount: condition.you, radius: youRadius, aoi: "you_label" }
      : { label: "other", amount: condition.other, radius: otherRadius, aoi: "other_label" };
    const lower = condition.position_condition === "top"
      ? { label: "other", amount: condition.other, radius: otherRadius, aoi: "other_label" }
      : { label: "you", amount: condition.you, radius: youRadius, aoi: "you_label" };

    const labelMidY = 17;
    const amountMidY = 12.5;
    if (compact) {
      const groupTop = shapeBounds.minY - verticalGap - lineGap - amountMidY;
      const groupBottom = shapeBounds.maxY + verticalGap - labelMidY + lineGap + amountTextHeight;
      cy = formalGroupCenterY - (groupTop + groupBottom) / 2;
    } else {
      const groupTop = shapeBounds.minY - verticalGap - lineGap - amountMidY;
      const groupBottom = shapeBounds.maxY + verticalGap - labelMidY + lineGap + amountTextHeight;
      cy = formalGroupCenterY - (groupTop + groupBottom) / 2;
    }
    const upperY = cy + shapeBounds.minY - verticalGap - lineGap - amountMidY;
    const lowerY = cy + shapeBounds.maxY + verticalGap - labelMidY;
    labelHtml = `
      ${calloutTextHtml(cx, upperY, upper.label, upper.amount, "middle", upper.aoi)}
      ${calloutTextHtml(cx, lowerY, lower.label, lower.amount, "middle", lower.aoi)}
    `;
  } else {
    const left = condition.position_condition === "left"
      ? { label: "you", amount: condition.you, radius: youRadius, aoi: "you_label" }
      : { label: "other", amount: condition.other, radius: otherRadius, aoi: "other_label" };
    const right = condition.position_condition === "left"
      ? { label: "other", amount: condition.other, radius: otherRadius, aoi: "other_label" }
      : { label: "you", amount: condition.you, radius: youRadius, aoi: "you_label" };
    if (!compact) {
      const labelTop = -24;
      const labelBottom = labelTop + lineGap + amountTextHeight;
      const groupTop = Math.min(shapeBounds.minY, labelTop);
      const groupBottom = Math.max(shapeBounds.maxY, labelBottom);
      cy = formalGroupCenterY - (groupTop + groupBottom) / 2;
    }
    const sideY = cy - 24;
    labelHtml = `
      ${calloutTextHtml(cx + shapeBounds.minX - horizontalGap, sideY, left.label, left.amount, "middle", left.aoi)}
      ${calloutTextHtml(cx + shapeBounds.maxX + horizontalGap, sideY, right.label, right.amount, "middle", right.aoi)}
    `;
  }

  return `
    <svg class="rose-chart" viewBox="0 0 780 ${viewBoxHeight}" role="img" aria-label="Pie chart showing the proposed allocation">
      <path class="sector" data-eye-aoi="other_sector" d="${sectorPath(cx, cy, otherRadius, otherStart, otherEnd)}" fill="${condition.other_color}"></path>
      <path class="sector" data-eye-aoi="you_sector" d="${sectorPath(cx, cy, youRadius, youStart, youEnd)}" fill="${condition.you_color}"></path>
      ${labelHtml}
    </svg>
  `;
}

function exampleRoseChartHtml(condition) {
  return roseChartHtml({
    you: 45,
    other: 55,
    you_radius_multiplier: 1,
    other_radius_multiplier: 1,
    position_condition: condition.position_condition,
    center_angle_degrees: condition.center_angle_degrees,
    you_color: condition.you_color,
    other_color: condition.other_color
  }, { compact: true });
}

function collectFormData(form) {
  const formData = new FormData(form);
  const response = {};
  formData.forEach(function (value, key) {
    response[key] = value;
  });
  return response;
}

function getFilteredDataCsv() {
  const fieldsToRemove = new Set([
    "platform",
    "experiment_name",
    "base_payment_usd",
    "bonus_draw_percent",
    "user_agent",
    "you_radius_multiplier",
    "other_radius_multiplier",
    "center_angle_degrees",
    "datapipe_condition_source",
    "you_color",
    "other_color",
    "comprehension_passed",
    "comprehension_response_json",
    "stimulus",
    "rt"
  ]);
  const totalRt = Math.round(performance.now() - experimentStartPerf);
  const rows = jsPsych.data.get().values().map(function (row) {
    const filtered = {};
    Object.keys(row).forEach(function (key) {
      if (!fieldsToRemove.has(key)) {
        filtered[key] = row[key];
      }
    });
    filtered.total_rt = totalRt;
    return filtered;
  });
  const columns = Array.from(rows.reduce(function (set, row) {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set()));
  const escapeCsv = function (value) {
    if (value === undefined || value === null) {
      return "";
    }
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  return [
    columns.map(escapeCsv).join(","),
    ...rows.map(row => columns.map(column => escapeCsv(row[column])).join(","))
  ].join("\n");
}

function rowsToCsv(rows, columns) {
  const escapeCsv = function (value) {
    if (value === undefined || value === null) {
      return "";
    }
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  return [
    columns.map(escapeCsv).join(","),
    ...rows.map(row => columns.map(column => escapeCsv(row[column])).join(","))
  ].join("\n");
}

function getGazeDataCsv() {
  const columns = [
    "subject_id", "session_id", "trial_id", "condition_index", "condition_label",
    "sample_index", "t_ms", "webgazer_elapsed_ms", "trial_start_epoch_ms",
    "x_px", "y_px", "x_norm", "y_norm", "viewport_width", "viewport_height",
    "valid", "aoi"
  ];
  return rowsToCsv(gazeSamples, columns);
}

function computeDecisionGazeSummary(durationMs) {
  const validSamples = gazeSamples.filter(sample => sample.valid === 1);
  const intervals = [];
  for (let index = 1; index < gazeSamples.length; index += 1) {
    intervals.push(gazeSamples[index].t_ms - gazeSamples[index - 1].t_ms);
  }
  const sortedIntervals = intervals.slice().sort((a, b) => a - b);
  const medianInterval = sortedIntervals.length === 0
    ? null
    : sortedIntervals[Math.floor(sortedIntervals.length / 2)];
  const aoiCounts = validSamples.reduce(function (counts, sample) {
    counts[sample.aoi] = (counts[sample.aoi] || 0) + 1;
    return counts;
  }, {});
  return {
    gaze_sample_count: gazeSamples.length,
    gaze_valid_sample_count: validSamples.length,
    gaze_duration_ms: Math.round(durationMs),
    gaze_effective_hz: durationMs > 0 ? Math.round((gazeSamples.length / durationMs) * 100000) / 100 : 0,
    gaze_median_interval_ms: medianInterval === null ? "" : Math.round(medianInterval * 10) / 10,
    gaze_max_interval_ms: intervals.length === 0 ? "" : Math.round(Math.max(...intervals) * 10) / 10,
    gaze_aoi_counts_json: JSON.stringify(aoiCounts)
  };
}

function desktopGateTrial() {
  const smallWindowOnly = device.smallWindow && !device.mobileLike;
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">${smallWindowOnly ? "Browser window too small" : "Desktop or laptop required"}</h2>
      <p class="warning">${smallWindowOnly
        ? "Please maximize your browser window and refresh the page to continue."
        : "This study must be completed on a desktop or laptop computer with a sufficiently large browser window."}</p>
      ${smallWindowOnly ? "" : "<p>Please return the study on Prolific and do not continue on this device.</p>"}
      <p class="muted">Detected window size: ${window.innerWidth} x ${window.innerHeight}</p>
    `),
    choices: [smallWindowOnly ? "Refresh after maximizing" : "Exit"],
    data: { phase: "device_block" },
    on_finish: function () {
      if (smallWindowOnly) {
        window.location.reload();
      }
    }
  };
}

function humanVerificationTrial(imagePath) {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <form id="human-verification-form" class="human-verification-form" novalidate>
        <div class="verification-question">Do the two straight lines below have the same length?</div>
        <img class="verification-image" src="${imagePath}" alt="Two horizontal lines with arrowheads for a visual verification question.">
        <div class="verification-options" role="radiogroup" aria-label="Human verification">
          <label class="single-choice-option">
            <input type="radio" name="human_verification_response" value="yes">
            <span>Yes</span>
          </label>
          <label class="single-choice-option">
            <input type="radio" name="human_verification_response" value="no">
            <span>No</span>
          </label>
        </div>
      </form>
    `,
    choices: "NO_KEYS",
    data: { phase: "human_verification" },
    on_load: function () {
      const pageStart = performance.now();
      const form = document.getElementById("human-verification-form");
      let answered = false;
      Array.from(form.querySelectorAll('input[name="human_verification_response"]')).forEach(function (input) {
        input.addEventListener("change", function () {
          if (answered) {
            return;
          }
          answered = true;
          const response = input.value;
          const rt = Math.round(performance.now() - pageStart);
          Array.from(form.querySelectorAll('input[name="human_verification_response"]')).forEach(option => option.disabled = true);
          setTimeout(function () {
          if (response === "yes") {
              setStoredStudyStatus("failed_verification");
              jsPsych.data.addProperties({
                human_verification_response: response,
                human_verification_passed: 0,
                human_verification_rt: rt
              });
              window.alert("You did not pass the verification check and therefore cannot participate in this study.");
              jsPsych.endExperiment(shellHtml(`
                <h2 class="intro-title">The study has ended.</h2>
                <p class="warning">You did not pass the verification check and therefore cannot participate in this study.</p>
                <p>Please return this study on Prolific. Do not submit a completion code.</p>
              `, STUDY_TITLE, "abort-shell"));
              return;
            }
            jsPsych.finishTrial({
              human_verification_response: response,
              human_verification_passed: 1,
              human_verification_rt: rt
            });
          }, 450);
        });
      });
    }
  };
}

function instructionDiagramHtml() {
  return `
    <div class="instruction-diagram" aria-label="Ultimatum game flow diagram">
      <div class="diagram-steps">
        <div class="diagram-step">
          <div class="step-number">1</div>
          <div class="role-card">
            <div class="role-pair">
              <div class="person proposer-person"></div>
              <div class="person receiver-person"></div>
            </div>
            <div class="role-labels"><span>Proposer</span><span>Receiver</span></div>
          </div>
          <div class="step-caption">Two roles.</div>
        </div>
        <div class="diagram-arrow">鈫?/div>
        <div class="diagram-step">
          <div class="step-number">2</div>
          <div class="proposal-card">
            <div class="bonus-circle">100<br><span>cents<br>bonus</span></div>
            <div class="mini-caption">Proposer decides<br>how to split.</div>
            <div class="mini-split">
              <span>You</span>
              <span>Proposer</span>
            </div>
          </div>
          <div class="step-caption">The proposer decides how to divide 100 cents.</div>
        </div>
        <div class="diagram-arrow">鈫?/div>
        <div class="diagram-step">
          <div class="step-number">3</div>
          <div class="receiver-card">
            <div class="mini-caption">Receiver sees the<br>proposed split.</div>
            <div class="mini-pie"><span>垄</span><span>垄</span></div>
            <div class="mini-caption">Receiver makes<br>one decision.</div>
            <div class="diagram-choice accept-choice">鉁?Accept</div>
            <div class="diagram-choice reject-choice">鉁?Reject</div>
          </div>
          <div class="step-caption">The receiver has one chance to decide.</div>
        </div>
        <div class="diagram-arrow">鈫?/div>
        <div class="diagram-step">
          <div class="step-number">4</div>
          <div class="outcome-card">
            <div class="outcome-title">Outcomes</div>
            <div class="diagram-choice accept-choice">鉁?Accept</div>
            <div class="outcome-text">Both receive the proposed amounts.</div>
            <div class="diagram-choice reject-choice">鉁?Reject</div>
            <div class="zero-row"><span>0</span><span>0</span></div>
            <div class="outcome-text">Both receive 0.</div>
          </div>
        </div>
      </div>
      <div class="diagram-notes">
        <div>You and the proposer do not know each other's personal information.</div>
        <div>${BONUS_DRAW_PERCENT}% of receivers are randomly selected for real bonus payment.</div>
      </div>
    </div>
  `;
}

function instructionTrial() {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">Instructions</h2>
      <p>In this study, you will complete a short economic decision-making task. Please read the instructions carefully. Your decisions may affect bonus payments for you and another participant. You will receive a base payment of <b>$${BASE_PAYMENT_USD.toFixed(2)}</b> for completing the study carefully.</p>
      <p>There are two roles in this task: <span class="doc-red">proposer</span> and <span class="doc-red">receiver</span>. The proposer first decides how to divide <span class="doc-red">100 cents</span> between themself and a receiver. The receiver then has one opportunity to decide whether to accept or reject the proposer's allocation.</p>
      <div class="instruction-flow-wrap">
        <img class="instruction-flow-image" src="instruction-flow.png" alt="Diagram showing the ultimatum game roles, proposal, receiver decision, and outcomes.">
      </div>
      <p>You have been assigned to the role of <span class="doc-red">RECEIVER</span>.</p>
      <p>A group of proposers has already participated in this study and made allocation decisions for 100 cents. For this task, one proposal will be randomly selected from this proposer database and shown to you. The proposal will show how much money would go to you and how much money would go to the proposer. The numerical amounts shown in the proposal determine the bonus outcome.</p>
      <p>You will have one opportunity to decide whether to accept or reject this allocation.</p>
      <ul>
        <li>If you <span class="doc-red">accept</span>, the 100-cent bonus will be divided between you and the proposer according to the proposer's allocation.</li>
        <li>If you <span class="doc-red">reject</span>, both you and the proposer receive 0 cents from this task.</li>
      </ul>
      <p>You and the proposer will not know any personal information about each other. You will only have this one opportunity to make your decision.</p>
      <p>After data collection is complete, <span class="doc-red">${BONUS_DRAW_PERCENT}%</span> of receivers will be randomly selected for real bonus payment. If you are selected, the proposal shown to you and your accept/reject decision will be used to determine the bonus. The outcome will be paid as a Prolific bonus. Bonus payments will be processed within two months after data collection is complete.</p>
      <p>Therefore, please consider the allocation carefully, because your decision may affect a real bonus for both you and another participant.</p>
    `, STUDY_TITLE, "instruction-shell"),
    choices: ["Continue"],
    data: { phase: "instructions" }
  };
}

function comprehensionTrial(conditionInfo) {
  const questions = [
    {
      name: "role",
      text: "1. What role will you have in this study?",
      options: [
        { value: "receiver", label: "Receiver" },
        { value: "proposer", label: "Proposer" },
        { value: "observer", label: "Observer" }
      ],
      correct: "receiver"
    },
    {
      name: "accept",
      text: "2. Example: the proposal gives you 45 cents and gives the other participant 55 cents. What happens if you accept this proposal?",
      exampleHtml: `
          <div class="comprehension-example">
          <div class="example-chart">${exampleRoseChartHtml(conditionInfo)}</div>
        </div>
      `,
      options: [
        { value: "shown_amounts", label: "You receive 45 cents, and the other participant receives 55 cents." },
        { value: "both_zero", label: "Both participants receive 0 cents from the game." },
        { value: "you_all", label: "You receive all 100 cents." }
      ],
      correct: "shown_amounts"
    },
    {
      name: "reject",
      text: "3. Example: the proposal gives you 45 cents and gives the other participant 55 cents. What happens if you reject this proposal?",
      exampleHtml: `
        <div class="comprehension-example">
          <div class="example-chart">${exampleRoseChartHtml(conditionInfo)}</div>
        </div>
      `,
      options: [
        { value: "shown_amounts", label: "You receive 45 cents, and the other participant receives 55 cents." },
        { value: "both_zero", label: "Both participants receive 0 cents from the game." },
        { value: "other_all", label: "The other participant receives all 100 cents." }
      ],
      correct: "both_zero"
    },
    {
      name: "bonus",
      text: "4. How are bonus outcomes determined?",
      options: [
        { value: "ten_percent_real", label: "10% of receivers are randomly selected. For selected receivers, the bonus will be allocated according to the receiver's decision and paid as a Prolific bonus." },
        { value: "everyone_real", label: "Every receiver receives the game outcome as a bonus." },
        { value: "no_real_bonus", label: "The game is hypothetical and no bonuses can be paid." }
      ],
      correct: "ten_percent_real"
    },
    {
      name: "total",
      text: "5. How much money is divided in the game proposal?",
      options: [
        { value: "100_cents", label: "100 cents" },
        { value: "10_dollars", label: "10 dollars" },
        { value: "unknown", label: "The amount is not specified" }
      ],
      correct: "100_cents"
    }
  ];

  const html = shellHtml(`
    <form id="comprehension-form" novalidate>
      <h2 class="intro-title">Comprehension Check</h2>
      <p class="muted">Please answer the following questions to make sure you understand the rules.</p>
      ${questions.map(function (q) {
        return `
          <div class="form-question">
            <div class="question-text">${q.text}</div>
            ${q.exampleHtml || ""}
            <div class="single-choice-list" role="radiogroup" aria-label="${q.name}">
              ${q.options.map(function (o) {
                return `
                  <label class="single-choice-option">
                    <input type="radio" name="${q.name}" value="${o.value}">
                    <span>${o.label}</span>
                  </label>
                `;
              }).join("")}
            </div>
            <div class="question-required" data-required-for="${q.name}">Please answer this question.</div>
          </div>
        `;
      }).join("")}
      <button type="submit" class="form-submit">Submit</button>
      <div id="comprehension-required" class="required-note">Please answer all questions before continuing.</div>
    </form>
  `);

  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: html,
    choices: "NO_KEYS",
    data: { phase: "comprehension_check" },
    on_load: function () {
      const pageStart = performance.now();
      const form = document.getElementById("comprehension-form");
      const warning = document.getElementById("comprehension-required");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const response = collectFormData(form);
        Array.from(form.querySelectorAll(".question-required")).forEach(function (message) {
          message.style.display = "none";
        });
        const unanswered = questions
          .filter(q => !response[q.name])
          .map(q => q.name);
        if (unanswered.length > 0) {
          unanswered.forEach(function (name) {
            const message = form.querySelector(`[data-required-for="${name}"]`);
            if (message) {
              message.style.display = "block";
            }
          });
          warning.textContent = unanswered.length === 1
            ? "Please answer this question before continuing."
            : "Please answer all questions before continuing.";
          warning.style.display = "block";
          return;
        }
        comprehensionAttempts += 1;
        warning.style.display = "none";
        const incorrect = questions
          .filter(q => response[q.name] !== q.correct)
          .map(q => q.name);
        comprehensionPassed = incorrect.length === 0;
        excludedForComprehension = !comprehensionPassed && comprehensionAttempts >= 2;
        if (excludedForComprehension) {
          setStoredStudyStatus("excluded_comprehension");
        }
        jsPsych.finishTrial({
          comprehension_attempt: comprehensionAttempts,
          comprehension_passed: comprehensionPassed ? 1 : 0,
          comprehension_incorrect_items: incorrect.join("|"),
          comprehension_response_json: JSON.stringify(response),
          comprehension_rt: Math.round(performance.now() - pageStart)
        });
      });
    }
  };
}

function warningTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">Incorrect response.</h2>
      <p class="warning">Please reread the instructions carefully.</p>
    `),
    choices: "NO_KEYS",
    trial_duration: 3000,
    data: { phase: "comprehension_warning" }
  };
}

function exclusionTrial() {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">The study has ended.</h2>
      <p class="warning">Based on your comprehension-check responses, you are not eligible to continue this study.</p>
      <p>Please return this study on Prolific. Do not submit a completion code.</p>
    `, STUDY_TITLE, "abort-shell"),
    choices: ["Exit"],
    data: { phase: "comprehension_exclusion" },
    on_finish: function () {
      plannedFullscreenExit = true;
      fullscreenAbortArmed = false;
      if (currentFullscreenElement() && document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };
}

function cameraSetupTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">Set up eye tracking</h2>
      <p>This study uses your webcam to estimate where you are looking on the screen.</p>
      <p>No webcam video or images will be saved. Video is processed locally in your browser, and only gaze coordinates, timestamps, and tracking-quality measures will be recorded.</p>
      <p>Please sit in a well-lit place, keep your face centered, and remain in the same position until the decision is complete.</p>
      <div class="eye-action-row">
        <button id="start-webgazer-button" class="jspsych-btn" type="button">Enable webcam</button>
      </div>
      <p id="webgazer-camera-status" class="muted" aria-live="polite"></p>
    `),
    choices: "NO_KEYS",
    data: { phase: "webgazer_camera_setup" },
    on_load: function () {
      const button = document.getElementById("start-webgazer-button");
      const status = document.getElementById("webgazer-camera-status");
      let cameraReady = false;
      button.addEventListener("click", async function () {
        if (cameraReady) {
          jsPsych.finishTrial({ camera_permission_granted: 1 });
          return;
        }
        button.disabled = true;
        status.classList.remove("warning");
        status.textContent = "Starting the webcam. Please allow camera access when your browser asks.";
        try {
          await initializeWebgazer();
          webgazerCameraFailed = false;
          jsPsych.data.addProperties({
            webgazer_camera_available: 1,
            webgazer_library_loaded: 1
          });
          cameraReady = true;
          status.textContent = "The webcam is ready. Center your face in the preview, then continue to calibration.";
          button.textContent = "Continue to calibration";
          button.disabled = false;
        } catch (error) {
          console.error("WebGazer initialization failed.", error);
          webgazerCameraFailed = true;
          try {
            webgazer.end();
          } catch (stopError) {
            console.warn("WebGazer cleanup after camera failure was unsuccessful.", stopError);
          }
          webgazerInitialized = false;
          jsPsych.data.addProperties({
            webgazer_camera_available: 0,
            webgazer_library_loaded: window.webgazer ? 1 : 0
          });
          status.classList.add("warning");
          status.textContent = cameraErrorMessage(error);
          button.textContent = "Retry webcam";
          button.disabled = false;
        }
      });
    }
  };
}

function eyePointPositions(count) {
  if (count === 3) {
    return [
      { x: 18, y: 50 },
      { x: 50, y: 50 },
      { x: 82, y: 50 }
    ];
  }
  const grid = [
    { x: 12, y: 14 }, { x: 50, y: 14 }, { x: 88, y: 14 },
    { x: 12, y: 50 }, { x: 50, y: 50 }, { x: 88, y: 50 },
    { x: 12, y: 86 }, { x: 50, y: 86 }, { x: 88, y: 86 }
  ];
  return grid.slice(0, Math.max(1, Math.min(count, grid.length)));
}

function calibrationTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () { return `
      <div class="eye-fullscreen-stage">
        <div class="eye-stage-message">
          <strong>Eye-tracking calibration</strong>
          <span>Look at the red dot and click it ${WEBGAZER_CLICKS_PER_POINT} times.</span>
        </div>
        <button id="eye-calibration-dot" class="eye-calibration-dot" type="button" aria-label="Calibration point">
          <span id="eye-calibration-count">${WEBGAZER_CLICKS_PER_POINT}</span>
        </button>
      </div>
    `; },
    choices: "NO_KEYS",
    data: { phase: "webgazer_calibration" },
    on_start: function () {
      eyeCalibrationAttempts += 1;
    },
    on_load: function () {
      const positions = eyePointPositions(WEBGAZER_CALIBRATION_POINTS);
      const dot = document.getElementById("eye-calibration-dot");
      const count = document.getElementById("eye-calibration-count");
      let pointIndex = 0;
      let clicksAtPoint = 0;
      setWebgazerDisplay({ video: false, prediction: false });
      webgazer.clearData();

      function placePoint() {
        const point = positions[pointIndex];
        dot.style.left = `${point.x}%`;
        dot.style.top = `${point.y}%`;
        clicksAtPoint = 0;
        count.textContent = String(WEBGAZER_CLICKS_PER_POINT);
        dot.disabled = false;
      }

      dot.addEventListener("click", function () {
        const rect = dot.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (typeof webgazer.recordScreenPosition === "function") {
          webgazer.recordScreenPosition(x, y, "click");
        }
        clicksAtPoint += 1;
        count.textContent = String(Math.max(0, WEBGAZER_CLICKS_PER_POINT - clicksAtPoint));
        if (clicksAtPoint < WEBGAZER_CLICKS_PER_POINT) {
          return;
        }
        dot.disabled = true;
        pointIndex += 1;
        if (pointIndex >= positions.length) {
          setWebgazerDisplay({ video: false, prediction: false });
          jsPsych.finishTrial({
            calibration_attempt: eyeCalibrationAttempts,
            calibration_point_count: positions.length,
            calibration_click_count: positions.length * WEBGAZER_CLICKS_PER_POINT
          });
          return;
        }
        window.setTimeout(placePoint, 180);
      });

      placePoint();
    }
  };
}

function validationTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <div class="eye-fullscreen-stage">
        <div class="eye-stage-message">
          <strong>Checking calibration</strong>
          <span>Keep your eyes on each blue dot until it moves.</span>
        </div>
        <div id="eye-validation-dot" class="eye-validation-dot" aria-hidden="true"></div>
      </div>
    `,
    choices: "NO_KEYS",
    data: { phase: "webgazer_validation" },
    on_load: async function () {
      const positions = eyePointPositions(WEBGAZER_VALIDATION_POINTS);
      const dot = document.getElementById("eye-validation-dot");
      const pointResults = [];
      setWebgazerDisplay({ video: false, prediction: false });

      const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
      for (let index = 0; index < positions.length; index += 1) {
        const point = positions[index];
        dot.style.left = `${point.x}%`;
        dot.style.top = `${point.y}%`;
        dot.classList.remove("is-measuring");
        await wait(WEBGAZER_VALIDATION_SETTLE_MS);
        const rect = dot.getBoundingClientRect();
        eyeValidationCollector = {
          targetX: rect.left + rect.width / 2,
          targetY: rect.top + rect.height / 2,
          startedPerf: performance.now(),
          samples: []
        };
        dot.classList.add("is-measuring");
        await wait(WEBGAZER_VALIDATION_SAMPLE_MS);
        const samples = eyeValidationCollector.samples.slice();
        eyeValidationCollector = null;
        const hitCount = samples.filter(sample => sample.distance_px <= WEBGAZER_VALIDATION_TOLERANCE_PX).length;
        pointResults.push({
          point_index: index + 1,
          target_x: Math.round(rect.left + rect.width / 2),
          target_y: Math.round(rect.top + rect.height / 2),
          sample_count: samples.length,
          hit_count: hitCount,
          hit_ratio: samples.length > 0 ? hitCount / samples.length : 0,
          mean_error_px: samples.length > 0
            ? samples.reduce((sum, sample) => sum + sample.distance_px, 0) / samples.length
            : null
        });
      }

      const totalSamples = pointResults.reduce((sum, point) => sum + point.sample_count, 0);
      const totalHits = pointResults.reduce((sum, point) => sum + point.hit_count, 0);
      const hitRatio = totalSamples > 0 ? totalHits / totalSamples : 0;
      const weightedError = totalSamples > 0
        ? pointResults.reduce((sum, point) => sum + ((point.mean_error_px || 0) * point.sample_count), 0) / totalSamples
        : null;
      eyeValidationPassed = hitRatio >= WEBGAZER_VALIDATION_PASS_RATIO;
      jsPsych.data.addProperties({
        eye_validation_passed: eyeValidationPassed ? 1 : 0,
        eye_calibration_attempts: eyeCalibrationAttempts,
        eye_validation_hit_ratio: Math.round(hitRatio * 10000) / 10000,
        eye_validation_mean_error_px: weightedError === null ? "" : Math.round(weightedError * 10) / 10
      });
      jsPsych.finishTrial({
        calibration_attempt: eyeCalibrationAttempts,
        validation_passed: eyeValidationPassed ? 1 : 0,
        validation_sample_count: totalSamples,
        validation_hit_ratio: Math.round(hitRatio * 10000) / 10000,
        validation_mean_error_px: weightedError === null ? "" : Math.round(weightedError * 10) / 10,
        validation_points_json: JSON.stringify(pointResults)
      });
    }
  };
}

function eyeCalibrationBlock() {
  return {
    timeline: [calibrationTrial(), validationTrial()],
    loop_function: function () {
      return !eyeValidationPassed && eyeCalibrationAttempts < WEBGAZER_MAX_CALIBRATION_ATTEMPTS;
    }
  };
}

function eyeQualityNoticeTrial() {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">Eye-tracking setup complete</h2>
      <p>The calibration did not reach the preferred tracking-quality threshold.</p>
      <p>Please keep your head still and remain in the same position during the decision. Your response will still be recorded.</p>
    `),
    choices: ["Continue"],
    data: { phase: "webgazer_low_quality_notice" }
  };
}

function threePointCalibrationTrial() {
  const clicksPerPoint = WEBGAZER_FINAL_CLICKS_PER_POINT;
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <div class="eye-fullscreen-stage">
        <div class="eye-stage-message">
          <strong>Final three-point calibration</strong>
          <span>Keep your head still. Look at the red dot and click it ${clicksPerPoint} times.</span>
        </div>
        <button id="eye-three-point-dot" class="eye-calibration-dot" type="button" aria-label="Calibration point">
          <span id="eye-three-point-count">${clicksPerPoint}</span>
        </button>
      </div>
    `,
    choices: "NO_KEYS",
    data: { phase: "webgazer_three_point_calibration" },
    on_load: function () {
      const positions = eyePointPositions(WEBGAZER_FINAL_CALIBRATION_POINTS);
      const dot = document.getElementById("eye-three-point-dot");
      const count = document.getElementById("eye-three-point-count");
      let pointIndex = 0;
      let clicksAtPoint = 0;
      webgazer.resume();
      setWebgazerDisplay({ video: false, prediction: false });

      function placePoint() {
        const point = positions[pointIndex];
        dot.style.left = `${point.x}%`;
        dot.style.top = `${point.y}%`;
        clicksAtPoint = 0;
        count.textContent = String(clicksPerPoint);
        dot.disabled = false;
      }

      dot.addEventListener("click", function () {
        const rect = dot.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        webgazer.recordScreenPosition(x, y, "click");
        clicksAtPoint += 1;
        count.textContent = String(Math.max(0, clicksPerPoint - clicksAtPoint));
        if (clicksAtPoint < clicksPerPoint) {
          return;
        }
        dot.disabled = true;
        pointIndex += 1;
        if (pointIndex >= positions.length) {
          jsPsych.finishTrial({
            calibration_point_count: positions.length,
            calibration_click_count: positions.length * clicksPerPoint
          });
          return;
        }
        window.setTimeout(placePoint, 180);
      });

      placePoint();
    }
  };
}

function decisionTrial(condition) {
  const html = shellHtml(`
    <div class="stimulus-content">
      <div class="offer-title" data-eye-aoi="decision_instructions">The other participant proposed this allocation of 100 cents.</div>
      <div class="offer-subtitle" data-eye-aoi="decision_instructions">
        This is your <span class="doc-red">actual decision</span>. Please decide whether to accept or reject this proposal.<br>
        You can submit this decision <span class="doc-red">only once</span>. Please consider the proposal carefully before confirming your choice.
      </div>
      <div class="rose-wrap">${roseChartHtml(condition)}</div>
      <div class="decision-buttons">
        <button class="decision-button" type="button" data-choice="accept" data-eye-aoi="accept_button">Accept</button>
        <button class="decision-button" type="button" data-choice="reject" data-eye-aoi="reject_button">Reject</button>
      </div>
      <div id="decision-confirm-panel" class="decision-confirm-panel" data-eye-aoi="confirmation_panel" hidden>
        <div id="selected-choice-text" class="selected-choice-text"></div>
        <div class="confirm-choice-wrap">
          <div class="confirm-tooltip">Once confirmed, your decision cannot be changed.</div>
          <button id="confirm-choice-button" class="confirm-choice-button" data-eye-aoi="confirm_button" type="button">Confirm choice</button>
        </div>
      </div>
    </div>
  `, STUDY_TITLE, "stimulus-shell");

  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: html,
    choices: "NO_KEYS",
    data: {
      phase: "ultimatum_decision",
      condition_index: condition.condition_index,
      condition_label: condition.condition_label,
      split_id: condition.split_id,
      you_cents: condition.you,
      other_cents: condition.other,
      area_condition: condition.area_condition,
      you_radius_multiplier: condition.you_radius_multiplier,
      other_radius_multiplier: condition.other_radius_multiplier,
      position_condition: condition.position_condition,
      center_angle_degrees: condition.center_angle_degrees,
      color_balance: condition.color_balance,
      you_color: condition.you_color,
      other_color: condition.other_color
    },
    on_load: function () {
      const pageStart = performance.now();
      gazeSamples.length = 0;
      decisionGazeCondition = condition;
      decisionGazeStartPerf = pageStart;
      decisionGazeStartEpochMs = Date.now();
      decisionGazeActive = true;
      if (webgazerInitialized) {
        webgazer.resume();
        setWebgazerDisplay({ video: false, prediction: false });
      }
      const buttons = Array.from(document.querySelectorAll(".decision-button"));
      const confirmPanel = document.getElementById("decision-confirm-panel");
      const selectedText = document.getElementById("selected-choice-text");
      const confirmButton = document.getElementById("confirm-choice-button");
      const choiceHistory = [];
      let currentChoice = null;
      let firstChoice = null;
      let choiceChangedCount = 0;
      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          const clickRt = Math.round(performance.now() - pageStart);
          const choice = button.getAttribute("data-choice");
          if (!firstChoice) {
            firstChoice = choice;
          } else if (choice !== currentChoice) {
            choiceChangedCount += 1;
          }
          currentChoice = choice;
          choiceHistory.push({ choice: choice, rt: clickRt });
          buttons.forEach(function (b) {
            b.classList.remove("selected");
            b.innerHTML = b.getAttribute("data-choice") === "accept" ? "Accept" : "Reject";
          });
          button.classList.add("selected");
          button.innerHTML = `<span class="decision-check" aria-hidden="true">&#10003;</span>${choice === "accept" ? "Accept" : "Reject"}`;
          selectedText.innerHTML = `You selected: <strong>${choice === "accept" ? "Accept" : "Reject"}</strong>.`;
          confirmPanel.hidden = false;
          confirmPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      });
      confirmButton.addEventListener("click", function () {
        if (!currentChoice) {
          return;
        }
        buttons.forEach(b => b.disabled = true);
        confirmButton.disabled = true;
        decisionGazeActive = false;
        const decisionDurationMs = performance.now() - pageStart;
        if (webgazerInitialized) {
          webgazer.pause();
          setWebgazerDisplay({ video: false, prediction: false });
        }
        jsPsych.finishTrial({
          ultimatum_choice: currentChoice,
          accepted: currentChoice === "accept" ? 1 : 0,
          decision_rt: Math.round(decisionDurationMs),
          first_choice: firstChoice,
          choice_changed_count: choiceChangedCount,
          choice_history_json: JSON.stringify(choiceHistory),
          ...computeDecisionGazeSummary(decisionDurationMs)
        });
      });
    }
  };
}

function scaleQuestionHtml(name, text, left, right) {
  return `
    <div class="form-question">
      <div class="question-text">${text}</div>
      <div class="scale-anchors"><span>${left}</span><span>${right}</span></div>
      <div class="radio-row" role="radiogroup" aria-label="${name}">
        ${[1,2,3,4,5,6,7].map(v => `
          <label class="radio-tile">
            <input type="radio" name="${name}" value="${v}">
            <span>${v}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;
}

function postScaleTrial(questions, pageNumber) {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: shellHtml(`
      <form id="post-form" novalidate>
        <h2 class="intro-title">Follow-up Questions</h2>
        <p class="muted post-instruction">There are no right or wrong answers. Please answer based on how you feel.</p>
        ${questions.map(q => scaleQuestionHtml(q.name, q.text, q.left, q.right)).join("")}
        <button type="submit" class="form-submit">Continue</button>
        <div id="post-required" class="required-note">Please answer all questions before continuing.</div>
      </form>
    `),
    choices: "NO_KEYS",
    data: { phase: `post_questionnaire_page_${pageNumber}` },
    on_load: function () {
      const pageStart = performance.now();
      const form = document.getElementById("post-form");
      const warning = document.getElementById("post-required");
      const questionRt = {};
      questions.forEach(function (q) {
        Array.from(form.querySelectorAll(`input[name="${q.name}"]`)).forEach(function (input) {
          input.addEventListener("change", function () {
            questionRt[q.name] = Math.round(performance.now() - pageStart);
          });
        });
      });
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const response = collectFormData(form);
        const unanswered = questions.filter(q => !response[q.name]).map(q => q.name);
        if (unanswered.length > 0) {
          warning.style.display = "block";
          return;
        }
        warning.style.display = "none";
        const pageRt = Math.round(performance.now() - pageStart);
        const trialData = {
          post_questionnaire_page: pageNumber,
          [`post_page${pageNumber}_rt`]: pageRt,
          [`post_page${pageNumber}_rt_json`]: JSON.stringify(questionRt)
        };
        questions.forEach(function (q) {
          trialData[q.name] = response[q.name];
        });
        jsPsych.finishTrial(trialData);
      });
    }
  };
}

function postRecallTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: shellHtml(`
      <form id="post-recall-form" novalidate>
        <h2 class="intro-title">Follow-up Questions</h2>
        <p class="muted post-instruction">These questions refer to the actual proposal you just decided on, not the example shown earlier.</p>
        <div class="form-question">
          <label class="question-text" for="recall-you-cents">Please recall the actual proposal you just decided on. How many cents would you receive if you accepted?</label>
          <div class="numeric-answer-row">
            <input id="recall-you-cents" class="numeric-input" name="recall_you_cents" type="number" min="0" max="100" step="1" inputmode="numeric">
            <span>cents</span>
          </div>
        </div>
        <div class="form-question">
          <label class="question-text" for="recall-proposer-cents">Please recall the actual proposal you just decided on. How many cents would the proposer receive if you accepted?</label>
          <div class="numeric-answer-row">
            <input id="recall-proposer-cents" class="numeric-input" name="recall_proposer_cents" type="number" min="0" max="100" step="1" inputmode="numeric">
            <span>cents</span>
          </div>
        </div>
        ${scaleQuestionHtml("recall_confidence_7", "How confident are you that you recalled the amounts correctly?", "1 - Not confident at all", "7 - Very confident")}
        <button type="submit" class="form-submit">Submit</button>
        <div id="post-required" class="required-note">Please enter whole numbers from 0 to 100 and answer the confidence question before continuing.</div>
      </form>
    `),
    choices: "NO_KEYS",
    data: { phase: "post_questionnaire_page_3" },
    on_load: function () {
      const pageStart = performance.now();
      const form = document.getElementById("post-recall-form");
      const warning = document.getElementById("post-required");
      const questionRt = {};
      ["recall_you_cents", "recall_proposer_cents"].forEach(function (name) {
        const input = form.querySelector(`[name="${name}"]`);
        if (input) {
          input.addEventListener("input", function () {
            input.value = input.value.replace(/\D/g, "");
            questionRt[name] = Math.round(performance.now() - pageStart);
          });
        }
      });
      Array.from(form.querySelectorAll(`input[name="recall_confidence_7"]`)).forEach(function (input) {
        input.addEventListener("change", function () {
          questionRt.recall_confidence_7 = Math.round(performance.now() - pageStart);
        });
      });
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const response = collectFormData(form);
        const validInteger = value => /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 100;
        if (!validInteger(response.recall_you_cents || "") || !validInteger(response.recall_proposer_cents || "") || !response.recall_confidence_7) {
          warning.style.display = "block";
          return;
        }
        warning.style.display = "none";
        jsPsych.finishTrial({
          post_questionnaire_page: 3,
          recall_you_cents: Number(response.recall_you_cents),
          recall_proposer_cents: Number(response.recall_proposer_cents),
          recall_confidence_7: response.recall_confidence_7,
          post_page3_rt: Math.round(performance.now() - pageStart),
          post_page3_rt_json: JSON.stringify(questionRt)
        });
      });
    }
  };
}

function postLowestAcceptTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: shellHtml(`
      <form id="post-lowest-accept-form" novalidate>
        <h2 class="intro-title">Follow-up Questions</h2>
        <p class="muted post-instruction">Please enter a number from 0 to 100 cents.</p>
        <div class="form-question">
          <label class="question-text" for="lowest-acceptable-cents">Now thinking more generally, what is the lowest amount you would accept for yourself in this task?</label>
          <div class="numeric-answer-row">
            <input id="lowest-acceptable-cents" class="numeric-input" name="lowest_acceptable_cents" type="number" min="0" max="100" step="1" inputmode="numeric">
            <span>cents</span>
          </div>
        </div>
        <button type="submit" class="form-submit">Submit</button>
        <div id="post-required" class="required-note">Please enter a whole number from 0 to 100 before continuing.</div>
      </form>
    `),
    choices: "NO_KEYS",
    data: { phase: "post_questionnaire_page_4" },
    on_load: function () {
      const pageStart = performance.now();
      const form = document.getElementById("post-lowest-accept-form");
      const warning = document.getElementById("post-required");
      const questionRt = {};
      const input = form.querySelector(`[name="lowest_acceptable_cents"]`);
      input.addEventListener("input", function () {
        input.value = input.value.replace(/\D/g, "");
        questionRt.lowest_acceptable_cents = Math.round(performance.now() - pageStart);
      });
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const response = collectFormData(form);
        const validInteger = value => /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 100;
        if (!validInteger(response.lowest_acceptable_cents || "")) {
          warning.style.display = "block";
          return;
        }
        warning.style.display = "none";
        jsPsych.finishTrial({
          post_questionnaire_page: 4,
          lowest_acceptable_cents: Number(response.lowest_acceptable_cents),
          post_page4_rt: Math.round(performance.now() - pageStart),
          post_page4_rt_json: JSON.stringify(questionRt)
        });
      });
    }
  };
}

function postOpenEndedTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: shellHtml(`
      <form id="post-open-form" novalidate>
        <h2 class="intro-title">Follow-up Questions</h2>
        <p class="muted post-instruction">Your feedback is very important to us. Thank you for sharing your thoughts.</p>
        <div class="form-question">
          <label class="question-text post-open-question" for="study-issue-comment">Was there anything about the proposal, the chart, the amounts shown, or the study overall that was unclear, confusing, or unexpected? Any feedback is helpful. If everything was clear, you may simply write "No."</label>
          <textarea id="study-issue-comment" class="text-area post-open-textarea" name="study_issue_comment" rows="5"></textarea>
        </div>
        <button type="submit" class="form-submit">Submit</button>
        <div id="post-required" class="required-note">Please answer this question before continuing.</div>
      </form>
    `),
    choices: "NO_KEYS",
    data: { phase: "post_questionnaire_page_5" },
    on_load: function () {
      const pageStart = performance.now();
      const form = document.getElementById("post-open-form");
      const warning = document.getElementById("post-required");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const response = collectFormData(form);
        if (!(response.study_issue_comment || "").trim()) {
          warning.style.display = "block";
          return;
        }
        warning.style.display = "none";
        jsPsych.finishTrial({
          post_questionnaire_page: 5,
          study_issue_comment: response.study_issue_comment.trim(),
          post_page5_rt: Math.round(performance.now() - pageStart)
        });
      });
    }
  };
}

function postQuestionnaireTrials() {
  return [
    postScaleTrial([
      { name: "fairness_7", text: "How fair do you think the proposal was?", left: "1 - Very unfair", right: "7 - Very fair" },
      { name: "acceptability_7", text: "How acceptable did you find this proposal?", left: "1 - Completely unacceptable", right: "7 - Completely acceptable" },
      { name: "anger_7", text: "How angry did the proposal make you feel?", left: "1 - Not angry at all", right: "7 - Extremely angry" },
      { name: "proposer_selfish_7", text: "How selfish did the proposer seem to you?", left: "1 - Not selfish at all", right: "7 - Extremely selfish" }
    ], 1),
    postScaleTrial([
      { name: "felt_own_share_size_7", text: "Thinking back to the proposal, how large did your share feel?", left: "1 - Very small", right: "7 - Very large" },
      { name: "felt_amount_difference_7", text: "Thinking back to the proposal, how large did the difference between your amount and the proposer's amount feel?", left: "1 - Very small", right: "7 - Very large" }
    ], 2),
    postRecallTrial(),
    postLowestAcceptTrial(),
    postOpenEndedTrial()
  ];
}

function localSaveNoticeTrial() {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">DataPipe is not configured yet.</h2>
      <p class="warning">This preview run cannot save to OSF/DataPipe because <code>DATAPIPE_EXPERIMENT_ID</code> is still a placeholder.</p>
      <p>The behavior and gaze CSV data are available in the browser console for testing. Replace the placeholder before running on Prolific.</p>
    `),
    choices: ["Continue"],
    data: { phase: "datapipe_not_configured_notice" },
    on_start: function () {
      stopWebgazer();
    }
  };
}

function savingTrial() {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `<div class="study-shell"><div class="qualtrics-card standalone saving-card"><h2>Saving your data...</h2><p>Please do not close this page.</p></div></div>`,
    choices: "NO_KEYS",
    trial_duration: 500,
    data: { phase: "before_save" },
    on_start: function () {
      stopWebgazer();
      if (comprehensionPassed) {
        setStoredStudyStatus("saving");
      }
    }
  };
}

function pipeSaveTrial() {
  return {
    type: jsPsychPipe,
    action: "save",
    experiment_id: DATAPIPE_EXPERIMENT_ID,
    filename: data_filename,
    data_string: () => getFilteredDataCsv(),
    wait_message: "<div class='study-shell'><div class='qualtrics-card standalone saving-card'><h2>Saving your data...</h2><p>Please do not close this page.</p></div></div>"
  };
}

function pipeSaveGazeTrial() {
  return {
    type: jsPsychPipe,
    action: "save",
    experiment_id: DATAPIPE_EXPERIMENT_ID,
    filename: gaze_filename,
    data_string: () => getGazeDataCsv(),
    wait_message: "<div class='study-shell'><div class='qualtrics-card standalone saving-card'><h2>Saving eye-tracking data...</h2><p>Please do not close this page.</p></div></div>"
  };
}

function finalPageTrial() {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: shellHtml(`
      <h2 class="intro-title">Your response has been saved.</h2>
      <p>Thank you for completing this study.</p>
      ${isCompletionCodeConfigured()
        ? `<p>Click the button below to return to Prolific.</p>`
        : `<p class="muted">The Prolific completion code is still a placeholder. Add the real code before launch.</p>`}
    `),
    choices: [isCompletionCodeConfigured() ? "Return to Prolific" : "Finish"],
    data: { phase: "final_page" },
    on_start: function () {
      if (comprehensionPassed) {
        setStoredStudyStatus("completed");
      }
    },
    on_finish: function () {
      plannedFullscreenExit = true;
      fullscreenAbortArmed = false;
      if (currentFullscreenElement() && document.exitFullscreen) {
        document.exitFullscreen();
      }
      if (isCompletionCodeConfigured()) {
        window.location.href = `https://app.prolific.com/submissions/complete?cc=${PROLIFIC_COMPLETION_CODE}`;
      }
    }
  };
}

async function buildAndRunExperiment() {
  const timeline = [];

  const storedStatus = getStoredStudyStatus();
  if (storedStatus && ["failed_verification", "fullscreen_exit", "excluded_comprehension", "completed"].includes(storedStatus.status)) {
    if (storedStatus.status === "completed" && isCompletionCodeConfigured()) {
      window.location.href = `https://app.prolific.com/submissions/complete?cc=${PROLIFIC_COMPLETION_CODE}`;
      return;
    }
    timeline.push(lockedStatusTrial(storedStatus));
    jsPsych.run(timeline);
    return;
  }

  if (!device.pass) {
    timeline.push(desktopGateTrial());
    jsPsych.run(timeline);
    return;
  }

  const { conditionNumber, source } = await getDatapipeCondition();
  const conditionInfo = conditionTable[conditionNumber];

  jsPsych.data.addProperties({
    datapipe_condition_source: source,
    condition_index: conditionInfo.condition_index,
    condition_label: conditionInfo.condition_label
  });

  timeline.push({
    type: jsPsychPreload,
    images: ["ModifiedMullerLyer.png"],
    continue_after_error: true,
    data: { phase: "preload" }
  });

  timeline.push(humanVerificationTrial("ModifiedMullerLyer.png"));

  timeline.push({
    type: jsPsychFullscreen,
    fullscreen_mode: true,
    message: `<div class="fullscreen-message">
      <h2>Welcome to the Study</h2>
      <p>The purpose of this study is to examine how people make decisions in social and economic contexts. Your careful participation is very important to us.</p>
      <p>This study uses your webcam to estimate where you look on the screen. Webcam video and images are processed locally in your browser and will not be saved or uploaded. The study records gaze coordinates, timestamps, calibration quality, and your task responses for research purposes.</p>
      <p>The study does not involve sensitive content. The collected research data will not be used for commercial purposes and will be analyzed without directly identifying you.</p>
      <p>Your participation is voluntary. You have the right to withdraw from the study at any time.</p>
      <p>This study must be completed on a <strong>desktop</strong> or <strong>laptop computer</strong>. Please enter fullscreen mode to begin. <span class="fullscreen-warning">If you exit fullscreen mode before the study ends, the study will stop automatically.</span></p>
      <p>By checking the box below and continuing, you confirm that you have read the information above and agree to participate in this study.</p>
      <label class="fullscreen-consent">
        <input id="ethics-consent" type="checkbox">
        <span>I acknowledge the information above, agree to webcam-based gaze tracking, and agree to participate in this study.</span>
      </label>
    </div>`,
    button_label: "Enter fullscreen and start",
    data: { phase: "fullscreen_start" },
    on_load: function () {
      const consent = document.getElementById("ethics-consent");
      const button = document.querySelector("#jspsych-fullscreen-btn") || document.querySelector(".jspsych-btn");
      if (consent && button) {
        button.disabled = true;
        button.classList.add("is-disabled");
        consent.addEventListener("change", function () {
          button.disabled = !consent.checked;
          button.classList.toggle("is-disabled", !consent.checked);
        });
      }
    },
    on_finish: function () {
      plannedFullscreenExit = false;
      fullscreenAbortArmed = true;
      jsPsych.data.addProperties({
        fullscreen_started: currentFullscreenElement() ? 1 : 0
      });
      if (window.innerWidth < 900 || window.innerHeight < 600) {
        fullscreenAbortArmed = false;
        jsPsych.endExperiment(shellHtml(`
          <h2 class="intro-title">Screen size too small</h2>
          <p class="warning">This study requires a fullscreen display of at least 900 x 600 pixels.</p>
          <p>Please return the study on Prolific and do not submit a completion code.</p>
          <p class="muted">Detected fullscreen size: ${window.innerWidth} x ${window.innerHeight}</p>
        `, STUDY_TITLE, "abort-shell"));
      }
    }
  });

  timeline.push(cameraSetupTrial());
  timeline.push(eyeCalibrationBlock());
  timeline.push({
    timeline: [eyeQualityNoticeTrial()],
    conditional_function: function () {
      return !eyeValidationPassed;
    }
  });

  timeline.push(instructionTrial());
  timeline.push(comprehensionTrial(conditionInfo));

  timeline.push({
    timeline: [warningTrial(), instructionTrial(), comprehensionTrial(conditionInfo)],
    conditional_function: function () {
      return !comprehensionPassed && !excludedForComprehension;
    }
  });

  timeline.push({
    timeline: [
      threePointCalibrationTrial(),
      decisionTrial(conditionInfo),
      ...postQuestionnaireTrials()
    ],
    conditional_function: function () {
      return comprehensionPassed;
    }
  });

  timeline.push({
    timeline: [savingTrial(), pipeSaveTrial(), pipeSaveGazeTrial()],
    conditional_function: function () {
      return isDatapipeConfigured() && (comprehensionPassed || excludedForComprehension);
    }
  });

  timeline.push({
    timeline: [localSaveNoticeTrial()],
    conditional_function: function () {
      return !isDatapipeConfigured() && (comprehensionPassed || excludedForComprehension);
    }
  });

  timeline.push({
    timeline: [finalPageTrial()],
    conditional_function: function () {
      return comprehensionPassed;
    }
  });

  timeline.push({
    timeline: [exclusionTrial()],
    conditional_function: function () {
      return excludedForComprehension;
    }
  });

  jsPsych.run(timeline);
}

buildAndRunExperiment();


