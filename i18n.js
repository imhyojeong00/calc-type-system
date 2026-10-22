const STR = {
  en: {
    role_body: "Case",
    role_dial: "Numerals",
    role_hands: "Hands",
    role_second: "Second hand",
    note_noxray: "Interior unseen",
    note_drop: "Hands fallen out",
    layered: "Grafted objects",
    z_empty: "Empty — reserved for the 26th clock",
    zoom_out: "Zoom out",
    zoom_in: "Zoom in",
    zoom_reset: "Reset zoom",
    lang_label: "Switch language",
    type_az: "Type A–Y",
    menu_open: "Open menu",
    menu: "Menu",
    close: "Close",
    close_menu: "Close menu",
    d_about: "About this work",
    d_xray: "X-ray",
    sound_on: "Sound on",
    sound_off: "Sound off",
    d_latest: "Back to latest clock",
    d_zoomreset: "Reset zoom",
    d_clear: "Clear all clocks",
    confirm_clear: "Clear every clock on the line?",
    keys_show: "Show keys",
    keys_hide: "Hide keys",
    k_back: "Delete last clock",
    k_prev: "Previous clock",
    k_next: "Next clock",
    k_latest: "Back to latest clock",
    k_latest_short: "Latest",
    kbd_label: "Clock keyboard",
    maker_name: "Im Hyojeong",
    about_p1: "Succulents arose in many places at once and survived by grafting and shedding parts. This site carries that logic over to clocks.",
    about_p2: "Each letter from A to Y is a clock. Type one and it is rebuilt on a single shared arbor — the axle the hands turn on — with the case, numerals, hands and second hand of five other clocks grafted onto it.",
    about_s1: "Type A–Y. Clocks line up like a sentence and overlap. Z is still empty.",
    about_s2: "Type the same letter twice and the hands fall out.",
    about_s3: "Swipe to look back along the line, tap a letter to jump to its clock, pinch to zoom.",
    about_s4: "Turn on <b>X-RAY</b> to watch each clock being assembled from the inside. With sound on, every clock keeps ticking in its own rhythm.",
    about_maker: "Im Hyojeong, Advanced Course, Kaywon University of Art &amp; Design, Korea",
    about_start: "Start typing",
  },
  ko: {
    role_body: "몸통",
    role_dial: "숫자",
    role_hands: "바늘",
    role_second: "초침",
    note_noxray: "내부 미확인",
    note_drop: "바늘 탈락",
    layered: "겹쳐진 사물",
    z_empty: "비어 있음 — 26번째 시계 자리",
    zoom_out: "축소",
    zoom_in: "확대",
    zoom_reset: "배율 초기화",
    lang_label: "언어 바꾸기",
    type_az: "A–Y 입력",
    menu_open: "메뉴 열기",
    menu: "메뉴",
    close: "닫기",
    close_menu: "메뉴 닫기",
    d_about: "작업 소개",
    d_xray: "엑스레이",
    sound_on: "소리 켜짐",
    sound_off: "소리 꺼짐",
    d_latest: "최근 시계로 돌아가기",
    d_zoomreset: "배율 초기화",
    d_clear: "시계 모두 지우기",
    confirm_clear: "줄에 있는 시계를 모두 지울까요?",
    keys_show: "자판 보기",
    keys_hide: "자판 숨기기",
    k_back: "마지막 시계 지우기",
    k_prev: "이전 시계",
    k_next: "다음 시계",
    k_latest: "최근 시계로 돌아가기",
    k_latest_short: "최근",
    kbd_label: "시계 자판",
    maker_name: "임효정",
    about_p1: "다육식물은 여러 곳에서 동시에 생겨나, 접목하고 몸을 떨궈 내며 살아남았다. 이 사이트는 그 논리를 시계로 옮긴다.",
    about_p2: "A부터 Y까지 글자 하나하나가 시계다. 글자를 치면 그 시계는 모든 시계가 함께 쓰는 하나의 굴대(바늘이 도는 축) 위에서 다시 조립되고, 다른 시계 다섯 개의 몸통·숫자·바늘·초침이 그 위에 접목된다.",
    about_s1: "A–Y를 쳐 보세요. 시계가 문장처럼 줄지어 겹쳐집니다. Z는 아직 비어 있습니다.",
    about_s2: "같은 글자를 두 번 치면 바늘이 빠집니다.",
    about_s3: "옆으로 밀어 지나온 줄을 둘러보고, 글자를 누르면 그 시계로 이동하며, 두 손가락으로 확대·축소합니다.",
    about_s4: "<b>X-RAY</b>를 켜면 시계가 안에서부터 조립되는 과정을 볼 수 있습니다. 소리를 켜 두면 시계마다 저마다의 박자로 계속 똑딱입니다.",
    about_maker: "임효정, 계원예술대학교 심화과정",
    about_start: "타이핑 시작",
  },
};

const COUNTRY_KO = { Germany: "독일", Czechia: "체코", France: "프랑스" };

// 항상 영문으로 시작 (예전에는 마지막 선택이 저장돼서 다음 방문 때 한국어로 열리기도 했음)
let LANG = "en";

function tr(key) {
  return (STR[LANG] && STR[LANG][key]) || STR.en[key] || key;
}

function clockName(c) {
  if (LANG !== "ko") return c.name;
  return c.name.replace(/\((Germany|Czechia|France)\)/g, (m, p) => `(${COUNTRY_KO[p]})`);
}

function applyStaticText() {
  document.documentElement.lang = LANG === "ko" ? "ko" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = tr(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", tr(el.dataset.i18nAria)); });
  const t = document.getElementById("lang-toggle");
  if (t) {
    t.dataset.lang = LANG;
    t.setAttribute("aria-pressed", String(LANG === "ko"));
    t.setAttribute("aria-label", LANG === "ko" ? "English" : "한국어");
  }
}

function setLang(next) {
  LANG = next === "ko" ? "ko" : "en";
  applyStaticText();
  document.dispatchEvent(new Event("langchange"));
}

document.addEventListener("DOMContentLoaded", applyStaticText);
