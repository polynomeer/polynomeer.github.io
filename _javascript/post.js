import { basic, initSidebar, initTopbar } from './modules/layouts';
import {
  loadImg,
  imgPopup,
  initLocaleDatetime,
  initClipboard,
  initSeriesPager,
  initSeriesProgress,
  initTxTimeline,
  toc
} from './modules/plugins';

loadImg();
toc();
imgPopup();
initSidebar();
initLocaleDatetime();
initClipboard();
initTopbar();
initSeriesPager();
initSeriesProgress();
initTxTimeline();
basic();
