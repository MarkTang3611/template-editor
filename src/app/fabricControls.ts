import { noop } from '@vueuse/core';
import { TControlSet } from '@/types/fabric';
import { PolygonElement } from '@/types/canvas';
import { PiBy180, toFixed } from '@/utils/common';
import { px2mm } from '@/utils/image';
import {
  Control,
  Object as FabricObject,
  controlsUtils,
  Point,
  Polygon,
  TPointerEvent,
  Transform,
  TDegree,
  util,
  TransformActionHandler,
  loadSVGFromURL
} from 'fabric';
import { storeToRefs } from 'pinia';
import { useMainStore } from '@/store';
import { ArcText } from '@/extension/object/ArcText';
import { loadSvgToPath2D } from '@/utils/image';

export const changeObjectHeight: TransformActionHandler = (
  eventData: TPointerEvent,
  transform: Transform,
  x: number,
  y: number
) => {
  const localPoint = controlsUtils.getLocalPoint(
    transform,
    transform.originX,
    transform.originY,
    x,
    y
  );

  //  make sure the control changes width ONLY from it's side of target
  const { target } = transform;
  if (
    (transform.originY === 'top' && localPoint.y > 0) ||
    (transform.originY === 'bottom' && localPoint.y < 0)
  ) {
    const strokeWidth = target.strokeWidth ? target.strokeWidth : 0;
    if (!target.scaleY) return false;
    const strokePadding = strokeWidth / (target.strokeUniform ? target.scaleY : 1);
    const oldHeight = target.height;
    const newHeight = Math.ceil(Math.abs((localPoint.y * 1) / target.scaleY) - strokePadding);
    target.set('height', Math.max(newHeight, 0));
    return oldHeight !== target.height;
  }
  return false;
};

export const changeObjectCurvature: TransformActionHandler = (
  eventData: TPointerEvent,
  transform: Transform,
  x: number,
  y: number
) => {
  const target = transform.target as ArcText;
  const localPoint = controlsUtils.getLocalPoint(
      transform,
      transform.originX,
      transform.originY,
      x,
      y
    ),
    strokePadding = target.strokeWidth / (target.strokeUniform ? target.scaleX : 1),
    multiplier = transform.originY === 'center' ? 2 : 1,
    cy =
      ((localPoint.y +
        target.controls[transform.corner].offsetY -
        target.height / 2 +
        target._contentOffsetY) *
        multiplier) /
        target.scaleY -
      strokePadding;

  const textHeight = target.calcTextHeight();

  let radius;
  if (Math.abs(cy) <= textHeight / 2) {
    radius = 0;
  } else {
    radius = cy > 0 ? cy - textHeight / 2 : cy + textHeight / 2;
  }

  target.set(radius);
  return false;
};

// define a function that can locate the controls.
// this function will be used both for drawing and for interaction.
export function polygonPositionHandler(dim: Point, finalMatrix: number[], fabricObject: any) {
  // @ts-ignore
  const pointIndex = this.pointIndex;

  const x = fabricObject.points[pointIndex].x - fabricObject.pathOffset.x;
  const y = fabricObject.points[pointIndex].y - fabricObject.pathOffset.y;
  // console.log('fabricObject:', fabricObject.canvas?.viewportTransform)
  const canvasTransform = fabricObject.canvas?.viewportTransform
    ? fabricObject.canvas?.viewportTransform
    : [1, 0, 0, 1, 0, 0];
  const point = util.transformPoint(
    { x, y } as Point,
    util.multiplyTransformMatrices(
      // fabricObject.canvas?.viewportTransform,
      canvasTransform,
      fabricObject.calcTransformMatrix()
    )
  );
  const snapPoint = fabricObject.pointMoving(pointIndex, point);
  // console.log('Point:', point, 'x:', x, 'y:', y, snapPoint)
  return point;
}

const getObjectSizeWithStroke = (object: FabricObject) => {
  const scaleX = object.scaleX,
    scaleY = object.scaleY,
    strokeWidth = object.strokeWidth;
  const width = object.width,
    height = object.height;
  const stroke = new Point(
    object.strokeUniform ? 1 / scaleX : 1,
    object.strokeUniform ? 1 / scaleY : 1
  ).scalarMultiply(strokeWidth);
  return new Point(width + stroke.x, height + stroke.y);
};

// define a function that can keep the polygon in the same position when we change its
// width/height/top/left.
export const anchorWrapper = (anchorIndex: number, fn: Function) => {
  return function (eventData: MouseEvent, transform: any, x: number, y: number) {
    const fabricObject = transform.target as Polygon;
    const pointX = fabricObject.points[anchorIndex].x,
      pointY = fabricObject.points[anchorIndex].y;
    const handlePoint = new Point({
      x: pointX - fabricObject.pathOffset.x,
      y: pointY - fabricObject.pathOffset.y
    });
    const absolutePoint = util.transformPoint(handlePoint, fabricObject.calcTransformMatrix()),
      actionPerformed = fn(eventData, transform, x, y),
      newDim = fabricObject.setDimensions(),
      polygonBaseSize = getObjectSizeWithStroke(fabricObject),
      newX = (pointX - fabricObject.pathOffset.x) / polygonBaseSize.x,
      newY = (pointY - fabricObject.pathOffset.y) / polygonBaseSize.y;
    fabricObject.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
    return actionPerformed;
  };
};

export const actionHandler = (eventData: TPointerEvent, transform: any, x: number, y: number) => {
  const polygon = transform.target as PolygonElement;
  if (!polygon.__corner) return;
  const currentControl = polygon.controls[polygon.__corner];
  const mouseLocalPosition = controlsUtils.getLocalPoint(transform, 'center', 'center', x, y);
  // const mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center')
  const polygonBaseSize = getObjectSizeWithStroke(polygon);

  const size = polygon._getTransformedDimensions(0);
  const finalPointPosition = {
    x: (mouseLocalPosition.x * polygonBaseSize.x) / size.x + polygon.pathOffset.x,
    y: (mouseLocalPosition.y * polygonBaseSize.y) / size.y + polygon.pathOffset.y
  } as Point;
  polygon.points[currentControl.pointIndex as number] = finalPointPosition;
  return true;
};

/**
 * 计算当前控件的位置
 */
const positionHandler: Control['positionHandler'] = (
  dim,
  finalMatrix,
  fabricObject,
  currentControl
) => {
  return new Point(
    currentControl.x * dim.x + currentControl.offsetX,
    currentControl.y * dim.y + currentControl.offsetY
  ).transform(finalMatrix);
};

export const getWidthHeight = (fabricObject: FabricObject, noFixed = false) => {
  const objScale = fabricObject.getObjectScaling();
  const point = fabricObject._getTransformedDimensions({
    scaleX: objScale.x,
    scaleY: objScale.y
  });
  if (!noFixed) {
    point.setX(toFixed(point.x));
    point.setY(toFixed(point.y));
  }
  return point;
};

/**
 * 更新ml, mr, mt, mb的控件大小
 */
const setCornersSize = (object: FabricObject) => {
  if (!object.canvas) return;
  const zoom = object.canvas.getZoom();
  const size = getWidthHeight(object).scalarMultiply(zoom);
  const controls = object.controls;
  const cornersH = ['ml', 'mr'];
  cornersH.forEach((corner) => {
    controls[corner].sizeX = object.cornerSize;
    controls[corner].sizeY = size.y;
    controls[corner].touchSizeX = object.touchCornerSize;
    controls[corner].touchSizeY = size.y;
  });
  const cornersV = ['mt', 'mb'];
  cornersV.forEach((corner) => {
    controls[corner].sizeX = size.x;
    controls[corner].sizeY = object.cornerSize;
    controls[corner].touchSizeX = size.x;
    controls[corner].touchSizeY = object.touchCornerSize;
  });
};

/**
 * 旋转图标
 */
const rotateIcon = (angle: number) => {
  return `url("data:image/svg+xml,<svg height='20' width='20' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'><g fill='none' transform='rotate(${angle} 16 16)'><path fill='white' d='M18.24 5.37C11.41 6.04 5.98 11.46 5.32 18.26L0 18.26L7.8 26L15.61 18.27L10.6 18.27C11.21 14.35 14.31 11.25 18.24 10.64L18.24 15.55L26 7.78L18.24 0L18.24 5.37Z'></path><path fill='black' d='M19.5463 6.61441C12.4063 6.68441 6.61632 12.4444 6.56632 19.5644L3.17632 19.5644L7.80632 24.1444L12.4363 19.5644L9.18632 19.5644C9.24632 13.8844 13.8563 9.28441 19.5463 9.22441L19.5463 12.3844L24.1463 7.78441L19.5463 3.16441L19.5463 6.61441Z'></path></g></svg>") 12 12,auto`;
};

/**
 * 旋转吸附，按住shift键，吸附15度角
 */
const rotationWithSnapping = (
  eventData: TPointerEvent,
  transform: Transform,
  x: number,
  y: number
) => {
  const { shiftKey } = eventData;
  const { target } = transform;
  const { rotationWithSnapping } = controlsUtils;
  let snapAngle: TDegree | undefined;
  if (shiftKey) {
    snapAngle = target.snapAngle;
    target.snapAngle = 15;
  }
  const res = rotationWithSnapping(eventData, transform, x, y);
  snapAngle && (target.snapAngle = snapAngle);
  return res;
};

/**
 * 获取旋转控件
 */
const getRotateControl = (angle: number): Partial<Control> => ({
  sizeX: 16,
  sizeY: 16,
  actionHandler: (eventData, transformData, x, y) => {
    transformData.target.canvas?.setCursor(rotateIcon(transformData.target.angle + angle));
    return rotationWithSnapping(eventData, transformData, x, y);
  },
  cursorStyleHandler: (eventData, control, fabricObject) => {
    return rotateIcon(fabricObject.angle + angle);
  },
  render: noop,
  actionName: 'rotate'
});

/**
 * 获取通用控件属性
 */
const getHornControl = {
  cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
  actionHandler: controlsUtils.scalingEqually,
  actionName: 'scaling'
};

const changeWidth = controlsUtils.wrapWithFireEvent(
  'scaling',
  controlsUtils.wrapWithFixedAnchor(controlsUtils.changeWidth)
);

const changeHeight = controlsUtils.wrapWithFireEvent(
  'scaling',
  controlsUtils.wrapWithFixedAnchor(changeObjectHeight)
);

const changeCurvature = controlsUtils.wrapWithFireEvent(
  'scaling',
  controlsUtils.wrapWithFixedAnchor(changeObjectCurvature)
);

// 图标和样式常量
const FIXED_ICON_SIZE = 12;
// const PADDING = 4;

export const defaultControls = (): TControlSet => ({
  // size: new Control({
  //   x: 0,
  //   y: 0.5,
  //   cursorStyleHandler: () => '',
  //   offsetY: 14,
  //   sizeX: 0.0001,
  //   sizeY: 0.0001,
  //   touchSizeX: 0.0001,
  //   touchSizeY: 0.0001,
  //   render: (ctx, left, top, styleOverride, fabricObject: FabricObject) => {
  //     // todo: 支持组内反转的对象
  //     ctx.save();
  //     ctx.translate(left, top);

  //     const calcRotate = () => {
  //       const objectAngle = fabricObject.group ? fabricObject.getTotalAngle() : fabricObject.angle;
  //       const angleInRadians = objectAngle * PiBy180;
  //       const x = Math.sin(angleInRadians);
  //       const y = Math.cos(angleInRadians);
  //       const angle = Math.abs(x) > Math.abs(y) ? Math.sign(x) * 90 : Math.sign(y) * 90 - 90;
  //       return (objectAngle - angle) * PiBy180;
  //     };

  //     ctx.rotate(calcRotate());

  //     const fontSize = 12;
  //     ctx.font = `${fontSize}px Tahoma`;
  //     ctx.textAlign = 'center';
  //     ctx.textBaseline = 'middle';

  //     const { x, y } = getWidthHeight(fabricObject);
  //     const { unitMode } = storeToRefs(useMainStore());
  //     const text = unitMode.value === 0 ? `${toFixed(px2mm(x))} × ${toFixed(px2mm(y))}` : `${x} × ${y}`;
  //     const width = ctx.measureText(text).width + 8;
  //     const height = fontSize + 6;

  //     // 背景
  //     ctx.fillStyle = '#0066ff';
  //     ctx.fillRect(-width / 2, -height / 2, width, height);
  //     ctx.fill();

  //     // 文字
  //     ctx.fillStyle = '#fff';
  //     ctx.fillText(text, 0, 1);
  //     ctx.restore();
  //   },
  //   positionHandler: (dim, finalMatrix, fabricObject: FabricObject, currentControl) => {
  //     const activeObject =
  //       fabricObject.canvas?.getActiveObject instanceof Function ? fabricObject.canvas?.getActiveObject() : null;

  //     if (activeObject && activeObject === fabricObject) {
  //       const angle = fabricObject.getTotalAngle();

  //       const angleInRadians = angle * PiBy180;

  //       const x = Math.sin(angleInRadians);
  //       const y = Math.cos(angleInRadians);

  //       if (Math.abs(x) >= Math.abs(y)) {
  //         const sign = Math.sign(x);
  //         currentControl.x = sign / 2;
  //         currentControl.y = 0;
  //         currentControl.offsetX = sign * 14;
  //         currentControl.offsetY = 0;
  //       } else {
  //         const sign = Math.sign(y);
  //         currentControl.x = 0;
  //         currentControl.y = sign / 2;
  //         currentControl.offsetX = 0;
  //         currentControl.offsetY = sign * 14;
  //       }

  //       // 更新其它corners大小，放到这里一起更新，来防止多次运行
  //       setCornersSize(fabricObject);
  //     }

  //     return positionHandler(dim, finalMatrix, fabricObject, currentControl);
  //   }
  // }),

  tlr: new Control({
    x: -0.5,
    y: -0.5,
    offsetX: -4,
    offsetY: -4,
    ...getRotateControl(0)
  }),

  trr: new Control({
    x: 0.5,
    y: -0.5,
    offsetX: 4,
    offsetY: -4,
    ...getRotateControl(90)
  }),

  brr: new Control({
    x: 0.5,
    y: 0.5,
    offsetX: 4,
    offsetY: 4,
    ...getRotateControl(180)
  }),

  blr: new Control({
    x: -0.5,
    y: 0.5,
    offsetX: -4,
    offsetY: 4,
    ...getRotateControl(270)
  }),

  ml: new Control({
    x: -0.5,
    y: 0,
    actionHandler: controlsUtils.scalingXOrSkewingY,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
    actionName: 'scaling'
    // render: noop
    // 不在这里设置positionHandler，放到size的positionHandler一起更新
    // positionHandler: positionHandlerH,
  }),

  mr: new Control({
    x: 0.5,
    y: 0,
    actionHandler: controlsUtils.scalingXOrSkewingY,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
    actionName: 'scaling'
    // render: noop
    // positionHandler: positionHandlerH,
  }),

  mb: new Control({
    x: 0,
    y: 0.5,
    actionHandler: controlsUtils.scalingYOrSkewingX,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
    actionName: 'scaling'
    // render: noop
    // positionHandler: positionHandlerV,
  }),

  mt: new Control({
    x: 0,
    y: -0.5,
    actionHandler: controlsUtils.scalingYOrSkewingX,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
    actionName: 'scaling'
    // render: noop
    // positionHandler: positionHandlerV,
  }),

  tl: new Control({
    x: -0.5,
    y: -0.5,
    ...getHornControl
  }),

  tr: new Control({
    x: 0.5,
    y: -0.5,
    ...getHornControl
  }),

  bl: new Control({
    x: -0.5,
    y: 0.5,
    ...getHornControl
  }),

  br: new Control({
    x: 0.5,
    y: 0.5,
    ...getHornControl
  }),

  lock: createLockIcon()
});

export const resizeControls = (): TControlSet => ({
  mr: new Control({
    x: 0.5,
    y: 0,
    actionHandler: changeWidth,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler
    // render: noop
    // positionHandler: positionHandlerH,
  }),
  ml: new Control({
    x: -0.5,
    y: 0,
    actionHandler: changeWidth,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler
    // render: noop
    // positionHandler: positionHandlerH,
  }),
  mt: new Control({
    x: 0,
    y: -0.5,
    actionHandler: changeHeight,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler
    // render: noop
    // positionHandler: positionHandlerH,
  }),
  mb: new Control({
    x: 0,
    y: 0.5,
    actionHandler: changeHeight,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler
    // render: noop
    // positionHandler: positionHandlerH,
  })
});

export const arcTextControls = (): TControlSet => ({
  c: new Control({
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
    // render (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: ArcText) {
    //   if(fabricObject.canvas!.showControlsGuidlines){
    //     ctx.save()
    //     ctx.strokeStyle = fabricObject.borderColor
    //     ctx.lineWidth = fabricObject.borderWidth
    //     // let cx = -fabricObject._contentOffsetX * fabricObject.scaleX
    //     // let cy = (fabricObject._curvingCenter.y - fabricObject._contentOffsetY) * fabricObject.scaleY
    //     ctx.beginPath()
    //     ctx.ellipse(left, top, Math.abs(fabricObject.radius) * fabricObject.scaleX, Math.abs(fabricObject.radius) * fabricObject.scaleY, 0, 0, 2 * Math.PI);
    //     ctx.stroke();
    //     ctx.restore()
    //   }
    // },
    actionHandler: changeCurvature,
    cursorStyle: 'pointer',
    actionName: 'resizing'
  }),
  ...defaultControls(),
  ...resizeControls()
});

export const lineControls = (): TControlSet => ({
  ml: new Control({
    x: -0.5,
    y: 0,
    actionHandler: changeWidth,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler
  }),
  mr: new Control({
    x: 0.5,
    y: 0,
    actionHandler: changeWidth,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler
  })
});

export const textboxControls = (): TControlSet => ({
  ...defaultControls(),
  ...resizeControls()
});

const LOCK_ICON_SVG =
  'M10.5397 8.97501C10.5397 9.98418 9.72164 10.8023 8.71248 10.8023C7.70331 10.8023 6.88522 9.98418 6.88522 8.97502V6.50285C6.88522 4.74963 7.81452 2.99389 9.03494 1.77348C10.4849 0.323558 12.0527 0.0537109 13.9793 0.0537109C15.8242 0.0537109 17.6149 0.679717 18.9236 1.98845C20.1762 3.24102 21.0733 4.89828 21.0733 6.71782V9.29747C21.0733 10.2473 20.3034 11.0172 19.3536 11.0172C18.4038 11.0172 17.6338 10.2473 17.6338 9.29747V7.36273C17.6338 6.0729 17.2038 5.21302 16.5589 4.56811C15.914 3.92319 15.0541 3.70822 13.9793 3.70822C12.9044 3.70822 12.0445 4.13816 11.3996 4.78308C10.7547 5.42799 10.5397 6.28788 10.5397 7.36273V8.97501ZM22.7931 12.522C23.223 12.522 23.653 12.737 24.0829 13.167C24.5129 13.5969 24.7278 14.0268 24.7278 14.4568V23.2706C24.7278 23.7005 24.7278 24.3455 24.5129 24.7754C24.2979 25.2053 24.0829 25.6353 23.653 25.8503C23.438 26.2802 23.0081 26.4952 22.5781 26.7101C22.1482 26.9251 21.7182 26.9251 21.0733 26.9251H6.67025C6.24031 26.9251 5.5954 26.9251 5.16545 26.7101C4.73551 26.4952 4.52054 26.2802 4.0906 25.8503C3.66066 25.4203 3.66066 25.2053 3.44568 24.7754C3.23071 24.3455 3.23071 23.9155 3.23071 23.4856V14.4568C3.23071 14.0268 3.44568 13.5969 3.87563 13.167C4.30557 12.737 4.73551 12.522 5.16545 12.522H22.7931Z';

export const createLockIcon = () => {
  const config = {
    // x, y 坐标：相对于元素边界的比例位置 [-0.5, -0.5] 就是左上角
    x: -0.5,
    y: -0.5,
    // 偏移量：确保图标在左上角的外面，而不是里面
    offsetX: -FIXED_ICON_SIZE,
    offsetY: -FIXED_ICON_SIZE,
    // 渲染函数
    render: renderLockIcon,
    // 禁用默认操作（如缩放、旋转）
    actionName: 'none',
    // 确保图标不响应事件 (因为它不需要点击删除功能)
    evented: false,
    // 总是可见（如果选中对象）
    visible: true
  };
  return new Control(config as any);
};

const renderLockIcon = (ctx, left, top, styleOverride, fabricObject) => {
  if (!fabricObject.canvas) return;

  // 获取画布的视图逆缩放因子 (Canvas 缩放的倒数)
  // 这是保证图标大小固定的关键！
  const vpt = fabricObject.canvas.viewportTransform;
  // console.log('vpt', vpt);
  const inverseScale = 1 / vpt[0];

  ctx.save();

  // 1. 平移到 Fabric 计算好的控件中心点
  // Fabric 控件系统已经处理了对象的缩放、旋转和平移，left/top 是精确的全局坐标
  ctx.translate(left + 6, top - 18);

  // 绘制锁头符号
  ctx.fillStyle = 'transparent';
  fabricObject.hoverCursor = '';

  if (fabricObject.isLock) {
    ctx.fillStyle = 'rgb(250, 81, 27)';
    fabricObject.hoverCursor = 'not-allowed';
  }

  const path = new Path2D(LOCK_ICON_SVG);
  ctx.fill(path);

  ctx.fontSize = FIXED_ICON_SIZE;

  // 如果使用 SVG 路径，应在这里绘制路径
  // ...

  ctx.restore();
};
