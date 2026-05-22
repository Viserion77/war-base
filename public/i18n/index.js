import ptBR from './pt-BR.js'
import en from './en.js'

const DICTS = { 'pt-BR': ptBR, en }
const STORAGE_KEY = 'war-base:lang'
const DEFAULT_LANG = 'pt-BR'

let currentLang = readSavedLang()
const listeners = new Set()

export function getLang() {
    return currentLang
}

export function setLang(lang) {
    if (!DICTS[lang]) {
        return
    }

    currentLang = lang
    const storage = getStorage()

    if (storage) {
        storage.setItem(STORAGE_KEY, lang)
    }

    listeners.forEach(listener => listener(lang))
}

export function onLangChange(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function t(key, vars) {
    const dict = DICTS[currentLang] || DICTS[DEFAULT_LANG]
    const template = dict[key] ?? DICTS[DEFAULT_LANG][key] ?? key
    return vars ? interpolate(template, vars) : template
}

export function __resetI18nForTests(lang = DEFAULT_LANG) {
    currentLang = DICTS[lang] ? lang : DEFAULT_LANG
    listeners.clear()
}

function interpolate(template, vars) {
    return template.replace(/{(\w+)}/g, (_, name) => vars[name] ?? '')
}

function readSavedLang() {
    const storage = getStorage()
    const saved = storage ? storage.getItem(STORAGE_KEY) : null
    return DICTS[saved] ? saved : DEFAULT_LANG
}

function getStorage() {
    try {
        return globalThis.localStorage || null
    } catch (error) {
        return null
    }
}
