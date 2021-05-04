try {
  if (window.parent.location.origin !== "https://scratch.mit.edu") throw "Scratch Addons: not first party iframe";
} catch {
  throw "Scratch Addons: not first party iframe";
}

chrome.runtime.sendMessage({ contentScriptReady: { url: location.href } }, (res) => {
  if (res) onInfoAvailable(res);
});

const DOLLARS = ["$1", "$2", "$3", "$4", "$5", "$6", "$7", "$8", "$9"];

const promisify = (callbackFn) => (...args) => new Promise((resolve) => callbackFn(...args, resolve));

let _page_ = null;

const comlinkIframesDiv = document.createElement("div");
comlinkIframesDiv.id = "scratchaddons-iframes";
const comlinkIframe1 = document.createElement("iframe");
comlinkIframe1.id = "scratchaddons-iframe-1";
comlinkIframe1.style.display = "none";
const comlinkIframe2 = comlinkIframe1.cloneNode();
comlinkIframe2.id = "scratchaddons-iframe-2";
const comlinkIframe3 = comlinkIframe1.cloneNode();
comlinkIframe3.id = "scratchaddons-iframe-3";
const comlinkIframe4 = comlinkIframe1.cloneNode();
comlinkIframe4.id = "scratchaddons-iframe-4";
comlinkIframesDiv.appendChild(comlinkIframe1);
comlinkIframesDiv.appendChild(comlinkIframe2);
comlinkIframesDiv.appendChild(comlinkIframe3);
comlinkIframesDiv.appendChild(comlinkIframe4);
document.documentElement.appendChild(comlinkIframesDiv);

const cs = {
  requestMsgCount() {
    chrome.runtime.sendMessage("getMsgCount");
  },
  copyImage(dataURL) {
    // Firefox only
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage({ clipboardDataURL: dataURL }).then(
        (res) => {
          resolve();
        },
        (res) => {
          reject(res.toString());
        }
      );
    });
  },
};
Comlink.expose(cs, Comlink.windowEndpoint(comlinkIframe1.contentWindow, comlinkIframe2.contentWindow));

const pageComlinkScript = document.createElement("script");
pageComlinkScript.src = chrome.runtime.getURL("libraries/comlink.js");
document.documentElement.appendChild(pageComlinkScript);

const moduleScript = document.createElement("script");
moduleScript.type = "module";
moduleScript.src = chrome.runtime.getURL("content-scripts/inject/module.js");

(async () => {
  await new Promise((resolve) => {
    moduleScript.addEventListener("load", resolve);
  });
  _page_ = Comlink.wrap(Comlink.windowEndpoint(comlinkIframe3.contentWindow, comlinkIframe4.contentWindow));
})();

document.documentElement.appendChild(moduleScript);

let initialUrl = location.href;
let path = new URL(initialUrl).pathname.substring(1);
if (path[path.length - 1] !== "/") path += "/";
const pathArr = path.split("/");
if (pathArr[0] === "scratch-addons-extension") {
  if (pathArr[1] === "settings") {
    let url = chrome.runtime.getURL("webpages/settings/index.html");
    if (location.hash) url += location.hash;
    chrome.runtime.sendMessage({ replaceTabWithUrl: url });
  }
}
if (path === "discuss/3/topic/add/") {
  window.addEventListener("load", () => forumWarning("forumWarning"));
  let uaElemModified = false;
  const modifyUAElem = () => {
    if (uaElemModified) return;
    const uaElem = document.getElementById("simple-user-agent");
    if (uaElem) {
      uaElem.textContent = uaElem.textContent.replace("My browser", "My web browser");
      return (uaElemModified = true);
    }
  };
  if (!modifyUAElem()) {
    new MutationObserver((mutationsList, observer) => {
      if (modifyUAElem()) {
        observer.disconnect();
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
    });
  }
} else if (path.startsWith("discuss/topic/")) {
  window.addEventListener("load", () => {
    if (document.querySelector('div.linkst > ul > li > a[href="/discuss/18/"]')) {
      forumWarning("forumWarningGeneral");
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[Message from background]", request);
  if (request === "getInitialUrl") {
    sendResponse(initialUrl);
  }
});

function addStyle(addon) {
  const allStyles = [...document.querySelectorAll(".scratch-addons-style")];
  const addonStyles = allStyles.filter((el) => el.getAttribute("data-addon-id") === addon.addonId);

  const appendByIndex = (el, index) => {
    // Append a style element in the correct place preserving order
    const nextElement = allStyles.find((el) => Number(el.getAttribute("data-addon-index") > index));
    if (nextElement) document.documentElement.insertBefore(el, nextElement);
    else {
      if (document.body) document.documentElement.insertBefore(el, document.body);
      else document.documentElement.appendChild(el);
    }
  };

  for (let userstyle of addon.styles) {
    if (addon.injectAsStyleElt) {
      // If an existing style is already appended, just enable it instead
      const existingEl = addonStyles.find((style) => style.textContent === userstyle);
      if (existingEl) {
        existingEl.disabled = false;
        continue;
      }

      const style = document.createElement("style");
      style.classList.add("scratch-addons-style");
      style.setAttribute("data-addon-id", addon.addonId);
      style.setAttribute("data-addon-index", addon.index);
      style.textContent = userstyle;
      appendByIndex(style, addon.index);
    } else {
      const existingEl = addonStyles.find((style) => style.href === userstyle);
      if (existingEl) {
        existingEl.disabled = false;
        continue;
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute("data-addon-id", addon.addonId);
      link.setAttribute("data-addon-index", addon.index);
      link.classList.add("scratch-addons-style");
      link.href = userstyle;
      appendByIndex(link, addon.index);
    }
  }
}
function removeAddonStyles(addonId) {
  // Instead of actually removing the style/link element, we just disable it.
  // That way, if the addon needs to be reenabled, it can just enable that style/link element instead of readding it.
  // This helps with load times for link elements.
  document.querySelectorAll(`[data-addon-id='${addonId}']`).forEach((style) => (style.disabled = true));
}

function injectUserstyles(addonsWithUserstyles) {
  for (const addon of addonsWithUserstyles || []) {
    addStyle(addon);
  }
}

function setCssVariables(addonSettings) {
  for (const addonId of Object.keys(addonSettings)) {
    for (const settingName of Object.keys(addonSettings[addonId])) {
      const value = addonSettings[addonId][settingName];
      if (typeof value === "string" || typeof value === "number")
        document.documentElement.style.setProperty(
          `--${addonId.replace(/-([a-z])/g, (g) => g[1].toUpperCase())}-${settingName.replace(/-([a-z])/g, (g) =>
            g[1].toUpperCase()
          )}`,
          addonSettings[addonId][settingName]
        );
    }
  }
}

async function onInfoAvailable({ globalState, l10njson, addonsWithUserscripts, addonsWithUserstyles }) {
  // In order for the "everLoadedAddons" not to change when "addonsWithUserscripts" changes, we stringify and parse
  const everLoadedAddons = JSON.parse(JSON.stringify(addonsWithUserscripts));
  const disabledDynamicAddons = [];
  setCssVariables(globalState.addonSettings);
  // Just in case, make sure the <head> loaded before injecting styles
  if (document.head) injectUserstyles(addonsWithUserstyles);
  else {
    const observer = new MutationObserver(() => {
      if (document.head) {
        injectUserstyles(addonsWithUserstyles);
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });
  }

  if (!_page_) {
    await new Promise((resolve) => {
      // We're registering this load event after the load event that
      // sets _page_, so we can guarantee _page_ exists now
      moduleScript.addEventListener("load", resolve);
    });
  }

  _page_.globalState = globalState;
  _page_.l10njson = l10njson;
  _page_.addonsWithUserscripts = addonsWithUserscripts;
  _page_.dataReady = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.newGlobalState) {
      _page_.globalState = request.newGlobalState;
      setCssVariables(request.newGlobalState.addonSettings);
    } else if (request.fireEvent) {
      _page_.fireEvent(request.fireEvent);
    } else if (request.dynamicAddonEnabled) {
      const { scripts, userstyles, addonId, injectAsStyleElt, index } = request.dynamicAddonEnabled;
      addStyle({ styles: userstyles, addonId, injectAsStyleElt, index });
      if (everLoadedAddons.find((addon) => addon.addonId === addonId)) {
        // Addon was reenabled
        _page_.fireEvent({ name: "reenabled", addonId, target: "self" });
      } else {
        // Addon was not injected in page yet
        _page_.runAddonUserscripts({ addonId, scripts, enabledLate: true });
      }

      addonsWithUserscripts.push({ addonId, scripts });
      addonsWithUserstyles.push({ styles: userstyles, addonId, injectAsStyleElt, index });
      everLoadedAddons.push({ addonId, scripts });
    } else if (request.dynamicAddonDisable) {
      const { addonId } = request.dynamicAddonDisable;
      disabledDynamicAddons.push(addonId);

      let addonIndex = addonsWithUserscripts.findIndex((a) => a.addonId === addonId);
      addonsWithUserscripts.splice(addonIndex, 1);
      addonIndex = addonsWithUserstyles.findIndex((a) => a.addonId === addonId);
      addonsWithUserstyles.splice(addonIndex, 1);

      removeAddonStyles(addonId);
      _page_.fireEvent({ name: "disabled", addonId, target: "self" });
    } else if (request.updateUserstylesSettingsChange) {
      const { scripts, userstyles, addonId, injectAsStyleElt, index } = request.updateUserstylesSettingsChange;
      // Removing the addon styles and readding them works since the background
      // will send a different array for the new valid userstyles.
      // Try looking for the "userscriptMatches" function.
      removeAddonStyles(addonId);
      addStyle({ styles: userstyles, addonId, injectAsStyleElt, index });
    } else if (request.setMsgCount) {
      _page_.setMsgCount(request.setMsgCount);
    } else if (request === "getRunningAddons") {
      const userscripts = addonsWithUserscripts.map((obj) => obj.addonId);
      const userstyles = addonsWithUserstyles.map((obj) => obj.addonId);
      sendResponse({ userscripts, userstyles, disabledDynamicAddons });
    }
  });
}

const escapeHTML = (str) => str.replace(/([<>'"&])/g, (_, l) => `&#${l.charCodeAt(0)};`);

function forumWarning(key) {
  let postArea = document.querySelector("form#post > label");
  if (postArea) {
    var errorList = document.querySelector("form#post > label > ul");
    if (!errorList) {
      let typeArea = postArea.querySelector("strong");
      errorList = document.createElement("ul");
      errorList.classList.add("errorlist");
      postArea.insertBefore(errorList, typeArea);
    }
    let addonError = document.createElement("li");
    let reportLink = document.createElement("a");
    reportLink.href = "https://scratchaddons.com/feedback";
    reportLink.target = "_blank";
    reportLink.innerText = chrome.i18n.getMessage("reportItHere");
    let text1 = document.createElement("span");
    text1.innerHTML = escapeHTML(chrome.i18n.getMessage(key, DOLLARS)).replace("$1", reportLink.outerHTML);
    addonError.appendChild(text1);
    errorList.appendChild(addonError);
  }
}

const showBanner = () => {
  const makeBr = () => document.createElement("br");

  const notifOuterBody = document.createElement("div");
  const notifInnerBody = Object.assign(document.createElement("div"), {
    id: "sa-notification",
    style: `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 700px;
    max-height: 270px;
    display: flex;
    align-items: center;
    padding: 10px;
    border-radius: 5px;
    background-color: #0f1b27;
    color: white;
    z-index: 99999;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    text-shadow: none;
    box-shadow: 0 0 20px 0px #0000009e;
    line-height: 1em;`,
  });
  // v1.14.0 TODO in line 365
  const notifImage = Object.assign(document.createElement("img"), {
    // alt: chrome.i18n.getMessage("hexColorPickerAlt"),
    src: chrome.runtime.getURL("/images/cs/icon.svg"),
    style: "height: 150px; border-radius: 5px; padding: 20px",
  });
  const notifText = Object.assign(document.createElement("div"), {
    id: "sa-notification-text",
    style: "margin: 12px;",
  });
  const notifTitle = Object.assign(document.createElement("span"), {
    style: "font-size: 18px; display: inline-block; margin-bottom: 12px;",
    textContent: chrome.i18n.getMessage("extensionUpdate"),
  });
  const notifClose = Object.assign(document.createElement("span"), {
    style: `
    float: right;
    cursor:pointer;
    background-color: #ffffff26;
    line-height: 10px;
    width: 10px;
    text-align: center;
    padding:5px;
    border-radius: 50%;`,
    title: chrome.i18n.getMessage("close"),
    textContent: "x",
  });
  notifClose.addEventListener("click", () => notifInnerBody.remove(), { once: true });

  const NOTIF_TEXT_STYLE = "display: block; font-size: 14px; color: white !important;";

  const notifInnerText0 = Object.assign(document.createElement("span"), {
    style: NOTIF_TEXT_STYLE + "font-weight: bold;",
    textContent: chrome.i18n
      .getMessage("extensionHasUpdated", DOLLARS)
      .replace(/\$(\d+)/g, (_, i) => [chrome.runtime.getManifest().version][Number(i) - 1]),
  });
  const notifInnerText1 = Object.assign(document.createElement("span"), {
    style: NOTIF_TEXT_STYLE,
    innerHTML: escapeHTML(chrome.i18n.getMessage("extensionUpdateInfo1", DOLLARS)).replace(
      /\$(\d+)/g,
      (_, i) =>
        [
          Object.assign(document.createElement("b"), { textContent: chrome.i18n.getMessage("newFeature") }).outerHTML,
          Object.assign(document.createElement("b"), { textContent: chrome.i18n.getMessage("newFeatureName") })
            .outerHTML,
          Object.assign(document.createElement("a"), {
            // TODO: remove `#addon-editor-dark-mode` next release
            href: "https://scratch.mit.edu/scratch-addons-extension/settings#addon-editor-dark-mode",
            target: "_blank",
            textContent: chrome.i18n.getMessage("scratchAddonsSettings"),
          }).outerHTML,
        ][Number(i) - 1]
    ),
  });
  const notifInnerText2 = Object.assign(document.createElement("span"), {
    style: NOTIF_TEXT_STYLE,
    innerHTML: escapeHTML(chrome.i18n.getMessage("extensionUpdateInfo2", DOLLARS)).replace(
      "$1",
      Object.assign(document.createElement("a"), {
        href: "https://scratchaddons.com/translate",
        target: "_blank",
        textContent: chrome.i18n.getMessage("helpTranslateScratchAddons"),
      }).outerHTML
    ),
  });
  const notifFooter = Object.assign(document.createElement("span"), {
    style: NOTIF_TEXT_STYLE,
  });
  const notifFooterChangelog = Object.assign(document.createElement("a"), {
    href: `https://scratchaddons.com/changelog?versionname=${chrome.runtime.getManifest().version}-notif`,
    target: "_blank",
    textContent: chrome.i18n.getMessage("changelog"),
    style: "text-transform: capitalize;", // Convert to title case
  });
  const notifFooterFeedback = Object.assign(document.createElement("a"), {
    href: `https://scratchaddons.com/feedback?version=${chrome.runtime.getManifest().version}-notif`,
    target: "_blank",
    textContent: chrome.i18n.getMessage("feedback"),
  });
  const notifFooterTranslate = Object.assign(document.createElement("a"), {
    href: "https://scratchaddons.com/translate",
    target: "_blank",
    textContent: chrome.i18n.getMessage("translate"),
  });
  const notifFooterLegal = Object.assign(document.createElement("small"), {
    textContent: chrome.i18n.getMessage("notAffiliated"),
  });
  notifFooter.appendChild(notifFooterChangelog);
  notifFooter.appendChild(document.createTextNode(" | "));
  notifFooter.appendChild(notifFooterFeedback);
  notifFooter.appendChild(document.createTextNode(" | "));
  notifFooter.appendChild(notifFooterTranslate);
  notifFooter.appendChild(makeBr());
  notifFooter.appendChild(notifFooterLegal);

  notifText.appendChild(notifTitle);
  notifText.appendChild(notifClose);
  notifText.appendChild(makeBr());
  notifText.appendChild(notifInnerText0);
  notifText.appendChild(makeBr());
  notifText.appendChild(notifInnerText1);
  notifText.appendChild(makeBr());
  notifText.appendChild(notifInnerText2);
  notifText.appendChild(makeBr());
  notifText.appendChild(notifFooter);

  notifInnerBody.appendChild(notifImage);
  notifInnerBody.appendChild(notifText);

  notifOuterBody.appendChild(notifInnerBody);

  document.body.appendChild(notifOuterBody);
};

const handleBanner = async () => {
  const currentVersion = chrome.runtime.getManifest().version;
  const [major, minor, _] = currentVersion.split(".");
  const currentVersionMajorMinor = `${major}.${minor}`;
  // Making this configurable in the future?
  // Using local because browser extensions may not be updated at the same time across browsers
  const settings = await promisify(chrome.storage.local.get.bind(chrome.storage.local))(["bannerSettings"]);
  const force = !settings || !settings.bannerSettings;

  if (force || settings.bannerSettings.lastShown !== currentVersionMajorMinor) {
    console.log("Banner shown.");
    await promisify(chrome.storage.local.set.bind(chrome.storage.local))({
      bannerSettings: Object.assign({}, settings.bannerSettings, { lastShown: currentVersionMajorMinor }),
    });
    showBanner();
  }
};

if (document.readyState !== "loading") {
  handleBanner();
} else {
  window.addEventListener("DOMContentLoaded", handleBanner, { once: true });
}
