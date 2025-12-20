<template>
  <div class="canvas-left w-[140px] h-[100vh] z-10 bg-[#fff]">
    <div class="left-top-tabs" id="left-top-tabs">
      <div class="top-tab">
        <el-tooltip placement="top" :hide-after="0" content="首页">
          <IconHome class="handler-item" @click="goHome" />
        </el-tooltip>
      </div>
    </div>
    <div class="element-list-box">
      <div class="element-box" draggable="true" @dragend="onDragEnd($event, 0)" @click="drawText(26)">
        <div class="icon-box">
          <SvgIcon icon-class="element-text" />
        </div>
        <span>文本</span>
      </div>
      <div class="element-box" draggable="true" @dragend="onDragEnd($event, 1)" @click="createBarElement()">
        <div class="icon-box">
          <SvgIcon icon-class="element-barcode" />
        </div>
        <span>条码</span>
      </div>
      <div class="element-box" draggable="true" @dragend="onDragEnd($event, 2)" @click="createQRElement('A1')">
        <div class="icon-box">
          <SvgIcon icon-class="element-qrcode" />
        </div>
        <span>二维码</span>
      </div>
      <div class="element-box" @click="chooseImg">
        <div class="icon-box">
          <SvgIcon icon-class="element-picture" />
        </div>
        <span>图片</span>
      </div>
      <!-- <div class="element-box" draggable="true" @dragend="onDragEnd($event, 3)" @click="createDateTextElement">
        <div class="icon-box">
          <SvgIcon icon-class="element-date" />
        </div>
        <span>时间</span>
      </div> -->
    </div>
    <el-upload
      ref="uploadRef"
      :on-change="handleImageChange"
      :limit="1"
      action="#"
      :accept="imageAcceptTypes.join()"
      :auto-upload="false"
      style="display: none"
    />
  </div>
</template>

<script lang="ts" setup>
import {
  encodeData,
  renderer25D,
  rendererRect,
  rendererRound,
  rendererRandRound,
  rendererDSJ,
  rendererRandRect,
  rendererImage,
  rendererCircle,
  rendererLine,
  rendererLine2,
  rendererFuncA,
  rendererFuncB,
  CodeOption
} from 'beautify-qrcode';
import { storeToRefs } from 'pinia';
import JsBarCode from 'jsbarcode';
import { QRCodeType, Template } from '@/types/canvas';
import useHandleCreate from '@/hooks/useHandleCreate';
import dayjs from 'dayjs';
import useCanvas from '@/views/Canvas/useCanvas';
import { useMainStore } from '@/store/modules/main';
import { UploadProps, genFileId, UploadRawFile } from 'element-plus';
import { imageAcceptTypes } from '@/configs/images';
import { useRouter } from 'vue-router';

const router = useRouter();

const generateQRCodeMap = {
  A1: rendererRect,
  A2: rendererRound,
  A3: rendererRandRound,
  SP1: rendererDSJ,
  SP2: rendererRandRect,
  SP3: rendererCircle,
  B1: renderer25D,
  C1: rendererImage,
  A_a1: rendererLine,
  A_a2: rendererLine2,
  A_b1: rendererFuncA,
  A_b2: rendererFuncB
};

const {
  setDrag,
  computedPointByDrag,
  createQRCodeElement,
  createBarCodeElement,
  createImageElement,
  createTextElement,
  createPathElement,
  createLineElement,
  createArcTextElement,
  createVerticalTextElement,
  createVideoElement,
  createTableElement
} = useHandleCreate();

const codeContent = ref<string>(window.location.href);
const codeSpace = ref<boolean>(false);
const codeError = ref<number>(0);
const mainStore = useMainStore();
const [canvas] = useCanvas();

const { systemFonts } = storeToRefs(mainStore);

const baseOptions = {
  format: 'CODE128',
  lineColor: '#000000',
  margin: 0, // 关键：去除边距
  width: 1,
  font: systemFonts.value[0].value,
  fontSize: 16,
  height: 40,
  displayValue: true,
  textPosition: 'bottom',
  fit: true // 自动根据 SVG 宽度填满
};

const barValue = 'V330L-BWL2502150027';

// 添加标题文字
const drawText = (fontSize: number, textStyle: 'transverse' | 'direction' = 'transverse', textHollow = false) => {
  createTextElement(fontSize, textStyle, textHollow);
};

const createBarElement = () => {
  const codeOption: JsBarCode.BaseOptions = baseOptions;
  JsBarCode('#barcode', barValue, codeOption);
  const barcode = document.getElementById('barcode');
  if (!barcode) return;
  const s = new XMLSerializer().serializeToString(barcode);
  const src = `data:image/svg+xml;base64,` + btoa(s);
  createBarCodeElement(src, barValue, codeOption);
};

const createQRElement = (style: QRCodeType) => {
  const src = `data:image/svg+xml;base64,` + btoa(generateQRCodeMap[style](getEncodeData(118, 118)));
  const codeOption = {
    codeStyle: style,
    codeSpace: codeSpace.value,
    codeError: codeError.value
  };
  createQRCodeElement(src, codeOption, codeContent.value);
};

// 获取qrcode
const getEncodeData = (width = 118, height = 118) => {
  const codeOption: CodeOption = {
    text: codeContent.value,
    width,
    height,
    correctLevel: codeError.value,
    isSpace: codeSpace.value
  };
  return encodeData(codeOption);
};

const uploadRef = ref();

// 上传文件
const handleImageChange = async (file: any, fileList: any) => {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target) {
      const imageUrl = e.target.result;
      createImageElement(imageUrl as string);
    }
    // 清空文件选择框
    uploadRef.value.clearFiles();
  };
  // 读取文件
  reader.readAsDataURL(file.raw);
};

const chooseImg = () => {
  // 使用 querySelector 获取文件输入框并触发点击事件
  const inputElement = uploadRef.value.$el.querySelector('input');
  if (inputElement) {
    inputElement.click(); // 触发点击事件打开文件选择框
  }
};

// const handleExceed: UploadProps['onExceed'] = (files: File[]) => {
//   uploadRef.value!.clearFiles();
//   const file = files[0] as UploadRawFile;
//   file.uid = genFileId();
//   uploadRef.value!.handleStart(file);
// };

const createDateTextElement = () => {
  createTextElement(26, 'transverse', false, dayjs().format('YYYY年MM月DD日'), { editable: false });
};

const onDragEnd = (event: any, type: number, data?: any) => {
  // 拖拽结束时可以执行一些操作
  setDrag(event.clientX, event.clientY);
  // console.log('onDragEnd：', event);
  switch (type) {
    case 0:
      // 横排文字
      drawText(26);
      break;
    case 1:
      // 条形码
      createBarElement();
      break;
    case 2:
      // 二维码
      createQRElement('A1');
      break;
    case 3:
      // 时间
      createDateTextElement();
      break;
    default:
      break;
  }
};

const goHome = () => {
  window.open(router.resolve({ path: `/home` }).href, '_blank');
};
</script>

<style lang="scss">
.canvas-left {
  // border-top: 1px solid #e6e6e6;
  user-select: none;
}
.element-box {
  width: 100%;
  height: 60px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 20px;
  font-weight: 500;
  font-size: 14px;
  color: #1d1d1d;
  line-height: 24px;
  .icon-box {
    // border: 1px dashed #7e7e93;
    padding: 4px 5px;
  }
  .svg-icon {
    font-size: 28px;
  }
  &:hover {
    background: #f2f2f2;
    // .icon-box {
    //   border: 1px dashed #f2f2f2;
    // }
  }
}
.top-tab {
  width: 100%;
  height: $headerHeight;
  text-align: center;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-bottom: 1px solid $borderColor;
  .handler-item {
    width: 32px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 0 2px;
    border-radius: $borderRadius;

    &:not(.group-btn):hover {
      background-color: #f1f1f1;
    }
  }
}
</style>
