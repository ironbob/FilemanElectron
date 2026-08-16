import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import FileInfoWindow from './components/windows/FileInfoWindow.vue'
import { i18n } from './i18n'
import './style.css'
import './styles/finder-ui.css'
import './polyfills'

const isFileInfoWindow = new URLSearchParams(window.location.search).has('file-info-window')
const app = createApp(isFileInfoWindow ? FileInfoWindow : App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.mount('#app')
