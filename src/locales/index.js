import Vue from 'vue'
import VueI18n from 'vue-i18n'
import storage from 'store'
import moment from 'moment'

Vue.use(VueI18n)

export const defaultLang = 'en-US'

const localeLoaders = import.meta.glob('./lang/*.js')
const messages = {}

const i18n = new VueI18n({
  silentTranslationWarn: true,
  locale: defaultLang,
  fallbackLocale: defaultLang,
  messages
})

const loadedLanguages = []

function setI18nLanguage (lang) {
  i18n.locale = lang
  const html = document.documentElement
  const isRtl = /^ar/i.test(lang)
  if (html) {
    // request.headers['Accept-Language'] = lang
    html.setAttribute('lang', lang)
    html.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
  }
  if (document.body) {
    document.body.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
    document.body.classList.toggle('rtl', isRtl)
  }
  return lang
}

export function loadLanguageAsync (lang = defaultLang) {
  return new Promise(resolve => {
    // 缓存语言设置
    storage.set('lang', lang)
    if (!loadedLanguages.includes(lang)) {
      const loader = localeLoaders[`./lang/${lang}.js`] || localeLoaders[`./lang/${defaultLang}.js`]
      const targetLang = localeLoaders[`./lang/${lang}.js`] ? lang : defaultLang
      if (!loader) {
        return resolve(setI18nLanguage(defaultLang))
      }
      return loader().then(msg => {
        const locale = msg.default
        i18n.setLocaleMessage(targetLang, locale)
        if (!loadedLanguages.includes(targetLang)) {
          loadedLanguages.push(targetLang)
        }
        moment.updateLocale(locale.momentName, locale.momentLocale)
        return resolve(setI18nLanguage(targetLang))
      })
    }
    if (i18n.locale !== lang) {
      return resolve(setI18nLanguage(lang))
    }
    return resolve(lang)
  })
}

export function i18nRender (key) {
  return i18n.t(`${key}`)
}

export default i18n
