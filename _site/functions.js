const ADDRESS_MASK = 0xFF03FFFF;
const MAX_ASLR = 124;
const ASLR_MASK = ~3;

const SLOT_SIZE = 80;
const BOX_SIZE = SLOT_SIZE * 30;

const MAX_DIFF = 4 + (BOX_SIZE + 10) * 14 + MAX_ASLR;

const START_DATA = {
    "Emerald": {start: "0x02029808", has_aslr: true},
    "FRLG": {start: "0x02029314", has_aslr: true},
    "RS": {start: "0x020300A0", has_aslr: false},
    "Emerald-JP": {start: "0x020294AC", has_aslr: true},
    "FRLG-JP": {start: "0x0202924C", has_aslr: true},
    "RS-JP": {start: "0x0202FDBC", has_aslr: false}
};

let current_info_containers_bg = new Map();


class FormValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "FormValidationError";
    }
}


function validTheme(theme) {
    return theme == "light" || theme == "dark";
}


function manualThemeUpdates(dark_mode) {
    let element = document.getElementById("theme-switch");
    if(element)
        element.checked = dark_mode;
    element = document.getElementById("msg-container");
    if(current_info_containers_bg.has("") && element) {
        let bg = current_info_containers_bg.get("");
        element.classList.remove(bg);
        if(dark_mode)
            bg = bg.replaceAll("-subtle", "");
        else
            bg += "-subtle";
        current_info_containers_bg.set("", bg);
        element.classList.add(bg);
    }
    element = document.getElementById("inverse-msg-container");
    if(current_info_containers_bg.has("inverse-") && element) {
        let bg = current_info_containers_bg.get("inverse-");
        element.classList.remove(bg);
        if(dark_mode)
            bg = bg.replaceAll("-subtle", "");
        else
            bg += "-subtle";
        current_info_containers_bg.set("inverse-", bg);
        element.classList.add(bg);
    }
}


function loadTheme(theme) {
    if(!validTheme(theme))
        return;
    setStoredTheme(theme);
    document.documentElement.setAttribute("data-bs-theme", theme);
    manualThemeUpdates(theme == "dark");
}


function getStoredTheme() {
    return localStorage.getItem("theme");
}


function setStoredTheme(theme) {
    localStorage.setItem("theme", theme);
}


function loadDefaultTheme() {
    let theme = getStoredTheme();
    if(theme == null)
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches? "dark": "light";
    loadTheme(theme);
}


loadDefaultTheme();


function formatToHex(num, digits, prefix) {
    prefix ??= "";
    digits ??= 0;
    return prefix + num.toString(16).toUpperCase().padStart(digits, "0");
}


function selectStart(type, selector_prefix) {
    if(type in START_DATA) {
        selector_prefix ??= "";
        const data = START_DATA[type];
        document.getElementById(selector_prefix + "start-input").value = data.start;
        document.getElementById(selector_prefix + "off-block").hidden = !data.has_aslr;
        if(data.has_aslr) {
            let value = parseInt(data.start);
            if(isNaN(value))
                return;
            let o = parseInt(document.getElementById(selector_prefix + "aslr-offset").value);
            if(!isNaN(o))
                value += o;
            document.getElementById(selector_prefix + "gpksptr-input").value = formatToHex(value, 8, "0x");
        }
    }
}


function displayMsg(msg, bg, selector_prefix) {
    selector_prefix ??= "";
    document.getElementById(selector_prefix + "msg-text").innerHTML = msg;
    bg = "bg-" + (bg?? "secondary");
    let element = document.getElementById(selector_prefix + "msg-container");
    if(current_info_containers_bg.has(selector_prefix))
        element.classList.remove(current_info_containers_bg.get(selector_prefix));
    current_info_containers_bg.set(selector_prefix, bg);
    element.classList.add(bg);
    element.hidden = false;
}


function clearMsg(selector_prefix) {
    selector_prefix ??= "";
    let element = document.getElementById(selector_prefix + "msg-container");
    if(current_info_containers_bg.has(selector_prefix)) {
        element.classList.remove(current_info_containers_bg.get(selector_prefix));
        current_info_containers_bg.delete(selector_prefix);
    }
    element.hidden = true;
}


function changeFullRange(value, selector_prefix) {
    selector_prefix ??= "";
    document.getElementById(selector_prefix + "full-range-check").checked = value;
    document.getElementById(selector_prefix + "aslr-offset").disabled = value;
    document.getElementById(selector_prefix + "gpksptr-input").disabled = value;
    document.getElementById(selector_prefix + "update-aslr-btn").disabled = value;
}


function updateASLROffset(selector_prefix) {
    selector_prefix ??= "";
    let s = parseInt(document.getElementById(selector_prefix + "start-input").value);
    if(isNaN(s))
        return;
    let p = parseInt(document.getElementById(selector_prefix + "gpksptr-input").value);
    if(isNaN(p))
        return;
    document.getElementById(selector_prefix + "aslr-offset").value = ((p - s) & ASLR_MASK) % 128;
}


function whichbox(offset) {
    if(offset < -4)
        return "";
    if(offset < 0)
        return "Box 1 - Slot 1 (-" + formatToHex(-offset, 2, "0x") + ")";
    box = Math.floor(offset / 2400) + 1;
    offset %= 2400;
    slot = Math.floor(offset / 80) + 1;
    offset %= 80;
    return "Box " + box + " - Slot " + slot + " (+" + formatToHex(offset, 2, "0x") + ")";
}


function whichaddr(start, box, slot) {
    return formatToHex(start + 4 + (box - 1) * BOX_SIZE + (slot - 1) * SLOT_SIZE, 8, "0x");
}


function validateFormDiff(diff) {
    if(diff < 0 || diff >= MAX_DIFF)
        throw new FormValidationError("Outside the PokemonStorage structure");
}


function parseTextNumber(num) {
    if(num.match(/^[+\-]?(\d+|0x[\da-f]+|0o[0-8]+|0b[01]+)$/i) == null)
        return NaN;
    return parseInt(num);
}


function parseWhichBoxFormData(data) {
    let result = { game: data.get("game") };
    if(isNaN(result.start = parseTextNumber(data.get("start"))))
        throw new FormValidationError("Invalid start value");
    if(isNaN(result.offset = parseTextNumber(data.get("offset"))))
        throw new FormValidationError("Invalid address value");
    result.start &= ADDRESS_MASK;
    result.offset &= ADDRESS_MASK;
    result.diff = result.offset - result.start;
    if(result.game != "RS" && result.game != "RS-JP") {
        result.full_range = !!data.get("full-range")
        if(result.full_range) {
            validateFormDiff(result.diff_end = result.diff);
            validateFormDiff(result.diff -= MAX_ASLR);
        } else {
            if(isNaN(result.aslr_offset = parseInt(data.get("aslr-offset"))))
                throw new FormValidationError("Invalid ASLR offset value");
            validateFormDiff(result.diff -= result.aslr_offset);
        }
    } else {
        validateFormDiff(result.diff);
    }
    return result;
}


function parseWhichAddressFormData(data) {
    let result = { game: data.get("inverse-game") };
    if(isNaN(result.start = parseTextNumber(data.get("inverse-start"))))
        throw new FormValidationError("Invalid start value");
    if(isNaN(result.box = parseInt(data.get("inverse-box"))))
        throw new FormValidationError("Invalid box value");
    if(isNaN(result.slot = parseInt(data.get("inverse-slot"))))
        throw new FormValidationError("Invalid slot value");
    if(
        result.game != "RS" &&
        result.game != "RS-JP" &&
        !(result.full_range = !!data.get("inverse-full-range")) &&
        isNaN(result.aslr_offset = parseInt(data.get("inverse-aslr-offset")))
    )
        throw new FormValidationError("Invalid ASLR offset value");
    return result;
}


function clearShareData(selector_prefix) {
    selector_prefix ??= "";
    document.getElementById(selector_prefix + "share-block").hidden = true;
    document.getElementById(selector_prefix + "share-url").value = "";
}


function setWhichBoxShareData(data) {
    let url = new URL(document.location.pathname, document.location.origin);
    let game = data.get("game");
    url.searchParams.set("mode", "whichbox");
    url.searchParams.set("game", game);
    url.searchParams.set("start", data.get("start"));
    url.searchParams.set("address", data.get("offset"));
    if(START_DATA[game].has_aslr) {
        let full_range;
        url.searchParams.set("full-range", full_range = !!data.get("full-range"));
        if(!full_range)
            url.searchParams.set("aslr-offset", data.get("aslr-offset"));
    }
    document.getElementById("share-url").value = url.toString();
    document.getElementById("share-block").hidden = false;
}


function setWhichAddressShareData(data) {
    let url = new URL(document.location.pathname, document.location.origin);
    let game = data.get("inverse-game");
    url.searchParams.set("mode", "address");
    url.searchParams.set("game", game);
    url.searchParams.set("start", data.get("inverse-start"));
    url.searchParams.set("box", data.get("inverse-box"));
    url.searchParams.set("slot", data.get("inverse-slot"));
    if(START_DATA[game].has_aslr) {
        let full_range;
        url.searchParams.set("full-range", full_range = !!data.get("inverse-full-range"));
        if(!full_range)
            url.searchParams.set("aslr-offset", data.get("inverse-aslr-offset"));
    }
    document.getElementById("inverse-share-url").value = url.toString();
    document.getElementById("inverse-share-block").hidden = false;
}


function submitWhichBox(event) {
    event.preventDefault();
    const error_bg = getStoredTheme() == "dark"? "danger": "danger-subtle";
    let data = new FormData(event.target);
    let parsed_data;
    try {
        parsed_data = parseWhichBoxFormData(data);
    } catch(error) {
        if(error.name != "FormValidationError")
            throw error;
        displayMsg(error.message, error_bg);
        clearShareData();
        return;
    }
    let result = whichbox(parsed_data.diff - 4);
    if(parsed_data.game != "RS" && parsed_data.game != "RS-JP" && parsed_data.full_range)
        result = "From " + result + " to " + whichbox(parsed_data.diff_end - 4);
    clearMsg();
    setWhichBoxShareData(data);
    document.getElementById("result-container").innerHTML = result;
}


function submitWhichAddress(event) {
    event.preventDefault();
    const error_bg = getStoredTheme() == "dark"? "danger": "danger-subtle";
    let data = new FormData(event.target);
    let parsed_data;
    try {
        parsed_data = parseWhichAddressFormData(data);
    } catch(error) {
        if(error.name != "FormValidationError")
            throw error;
        displayMsg(error.message, error_bg, "inverse-");
        clearShareData("inverse-");
        return;
    }
    let result;
    if(parsed_data.game == "RS" || parsed_data.game == "RS-JP") {
        result = whichaddr(parsed_data.start, parsed_data.box, parsed_data.slot);
    } else {
        if(parsed_data.full_range) {
            result = (
                whichaddr(parsed_data.start, parsed_data.box, parsed_data.slot) +
                " - " +
                whichaddr(parsed_data.start + MAX_ASLR, parsed_data.box, parsed_data.slot)
            );
        } else {
            result = whichaddr(parsed_data.start + parsed_data.aslr_offset, parsed_data.box, parsed_data.slot);
        }
    }
    clearMsg("inverse-");
    setWhichAddressShareData(data);
    document.getElementById("inverse-result-container").innerHTML = result;
}


function parseWhichBoxURLParams(params) {
    let data;
    let game = params.get("game")?? "Emerald";
    document.getElementById("select-game").value = game;
    if(params.has("start") && !isNaN(data = parseTextNumber(params.get("start")))) {
        document.getElementById("start-input").value = formatToHex(data, 8, "0x");
    } else if(params.has("gPokemonStorage") && !isNaN(data = parseTextNumber(params.get("gPokemonStorage")))) {
        document.getElementById("start-input").value = formatToHex(data, 8, "0x");
    }
    if(params.has("address") && !isNaN(data = parseTextNumber(params.get("address"))))
        document.getElementById("address-input").value = formatToHex(data, 8, "0x");
    if(!START_DATA[game].has_aslr) {
        document.forms["generator"].requestSubmit();
        return;
    }
    if(!params.has("full-range") || params.get("full-range") != "false") {
        changeFullRange(true);
    } else {
        changeFullRange(false);
        if(params.has("aslr-offset") && !isNaN(data = parseInt(params.get("aslr-offset")))) {
            document.getElementById("aslr-offset").value = data;
        } else if(params.has("gPokemonStoragePtr") && !isNaN(data = parseInt(params.get("gPokemonStoragePtr")))) {
            document.getElementById("gpksptr-input").value = data;
            updateASLROffset();
        }
    }
    document.forms["generator"].requestSubmit();
}


function parseWhichAddressURLParams(params) {
    let data;
    let game = params.get("game")?? "Emerald";
    document.getElementById("inverse-select-game").value = game;
    if(params.has("start") && !isNaN(data = parseTextNumber(params.get("start")))) {
        document.getElementById("inverse-start-input").value = formatToHex(data, 8, "0x");
    } else if(params.has("gPokemonStorage") && !isNaN(data = parseTextNumber(params.get("gPokemonStorage")))) {
        document.getElementById("inverse-start-input").value = formatToHex(data, 8, "0x");
    }
    if(params.has("box") && !isNaN(data = parseInt(params.get("box"))))
        document.getElementById("inverse-box-input").value = data;
    if(params.has("slot") && !isNaN(data = parseInt(params.get("slot"))))
        document.getElementById("inverse-slot-input").value = data;
    if(!START_DATA[game].has_aslr) {
        document.forms["inverse-generator"].requestSubmit();
        return;
    }
    if(!params.has("full-range") || params.get("full-range") != "false") {
        changeFullRange(true, "inverse-");
    } else {
        changeFullRange(false, "inverse-");
        if(params.has("aslr-offset") && !isNaN(data = parseInt(params.get("aslr-offset")))) {
            document.getElementById("inverse-aslr-offset").value = data;
        } else if(params.has("gPokemonStoragePtr") && !isNaN(data = parseInt(params.get("gPokemonStoragePtr")))) {
            document.getElementById("inverse-gpksptr-input").value = data;
            updateASLROffset("inverse-");
        }
    }
    document.forms["inverse-generator"].requestSubmit();
}


function parseURLParams() {
    let params = new URLSearchParams(document.location.search);
    if(params.size == 0)
        return;
    if(params.has("game") && !(params.get("game") in START_DATA))
        return;
    if(params.has("mode") && params.get("mode") == "address")
        parseWhichAddressURLParams(params);
    else
        parseWhichBoxURLParams(params);
}

function copyShareUrl(selector_prefix) {
    selector_prefix ??= "";
    navigator.clipboard.writeText(document.getElementById(selector_prefix + "share-url").value);
    let element = document.getElementById(selector_prefix + "share-msg");
    element.classList.toggle("show-msg");
    setTimeout((element) => element.classList.toggle("show-msg"), 5000, element);
}


document.addEventListener("DOMContentLoaded", () => {
    loadDefaultTheme();
    document.getElementById("msg-container").hidden = true;
    document.getElementById("inverse-msg-container").hidden = true;
    parseURLParams();
});
