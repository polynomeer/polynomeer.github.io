import { basic, initSidebar, initTopbar } from './modules/layouts';
import {
  loadImg,
  imgPopup,
  initClipboard,
  initSeriesPager,
  initSeriesProgress,
  initBlogMap
} from './modules/plugins';

loadImg();
imgPopup();
initSidebar();
initTopbar();
initClipboard();
initSeriesPager();
initSeriesProgress();
initBlogMap();
basic();
