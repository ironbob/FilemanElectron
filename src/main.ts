import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import FileInfoWindow from './components/windows/FileInfoWindow.vue'
import './style.css'
import './styles/finder-ui.css'
import './polyfills'

const isFileInfoWindow = new URLSearchParams(window.location.search).has('file-info-window')
const app = createApp(isFileInfoWindow ? FileInfoWindow : App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
