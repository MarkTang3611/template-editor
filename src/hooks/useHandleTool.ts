import useCanvas from "@/views/Canvas/useCanvas"
import useCenter from "@/views/Canvas/useCenter"
import useCanvasZindex from "./useCanvasZindex"
import { AlignCommand, ElementNames, LayerCommand } from "@/types/elements"
import { useTemplatesStore } from "@/store"
import { Group } from "fabric"

export default () => {
  
  const alignElement = (command: AlignCommand) => {
    const [ canvas ] = useCanvas()
    const { left, top, width, height, centerPoint } = useCenter()
    const handleElement = canvas.getActiveObject()
    const templatesStore = useTemplatesStore()
    if (!handleElement) return
    
    let options: Record<string, any> = {}
        // 多个元素
    if (handleElement.type.toLowerCase() === ElementNames.ACTIVE) {
      const activeObject = handleElement as Group;
      switch (command) {
        case AlignCommand.LEFT:
          activeObject._objects.forEach((item: any) =>
            item.set({ left: -activeObject.width / 2 + (item.width * item.scaleX) / 2 })
          );
          break;
        case AlignCommand.RIGHT:
          activeObject._objects.forEach((item: any) =>
            item.set({ left: activeObject.width / 2 - (item.width * item.scaleX) / 2 })
          );
          break;
        case AlignCommand.TOP:
          activeObject._objects.forEach((item: any) =>
            item.set({ top: -activeObject.height / 2 + (item.height * item.scaleY) / 2 })
          );
          break;
        case AlignCommand.BOTTOM:
          activeObject._objects.forEach((item: any) =>
            item.set({ top: activeObject.height / 2 - (item.height * item.scaleY) / 2 })
          );
          break;
        // 水平居中
        case AlignCommand.HORIZONTAL:
          activeObject._objects.forEach((item: any) => item.set({ left: 0 }));
          break;
        // 水平等距
        case AlignCommand.HORIZONTAL_EQUIDISTANCE: {
          const activeObjectWidth = activeObject.width;
          let allItemWidths = 0;
          activeObject._objects.forEach((item: any) => {
            allItemWidths = allItemWidths + item.width;
          });
          // 间距
          const equidistance = (activeObjectWidth - allItemWidths) / (activeObject._objects.length - 1);
          if (equidistance < 0) {
            ElMessage.warning('水平等距设置失败，请检查！');
            return;
          }
          let start = -activeObject.width / 2;

          activeObject._objects.forEach((item: any, index: number) => {
            item.set({ left: start + item.width / 2 });
            start = start + item.width * item.scaleX + equidistance;
          });
          break;
        }
        // 垂直居中
        case AlignCommand.VERTICAL:
          activeObject._objects.forEach((item: any) => item.set({ top: 0 }));
          break;
        // 垂直等距
        case AlignCommand.VERTICAL_EQUIDISTANCE: {
          const activeObjectHeight = activeObject.height;
          let allItemHeights = 0;
          activeObject._objects.forEach((item: any) => {
            allItemHeights = allItemHeights + item.height;
          });
          const equidistance = (activeObjectHeight - allItemHeights) / (activeObject._objects.length - 1);
          if (equidistance < 0) {
            ElMessage.warning('垂直等距设置失败，请检查！');
            return;
          }
          let start = -activeObject.height / 2;

          activeObject._objects.forEach((item: any, index: number) => {
            item.set({ top: start + item.height / 2 });
            start = start + item.height * item.scaleY + equidistance;
          });
          break;
        }
        case AlignCommand.CENTER:
          activeObject._objects.forEach((item: any) => item.set({ left: 0 }));
          activeObject._objects.forEach((item: any) => item.set({ top: 0 }));
          break;
        default:
          break;
      }
    } else {
      // 单个元素
      canvas.discardActiveObject();
      switch (command) {
        case AlignCommand.LEFT:
          options = { left: left + (handleElement.width * handleElement.scaleX) / 2 };
          handleElement.set(options);
          break;
        case AlignCommand.RIGHT:
          options = { left: left + width - (handleElement.width * handleElement.scaleX) / 2 };
          handleElement.set(options);
          break;
        case AlignCommand.TOP:
          options = { top: top + (handleElement.height * handleElement.scaleY) / 2 };
          handleElement.set(options);
          break;
        case AlignCommand.BOTTOM:
          options = { top: top + height - (handleElement.height * handleElement.scaleY) / 2 };
          handleElement.set(options);
          break;
        case AlignCommand.HORIZONTAL:
          options = {
            left: centerPoint.x
          };
          handleElement.set(options);
          break;
        case AlignCommand.VERTICAL:
          options = {
            top: centerPoint.y
          };
          handleElement.set(options);
          break;
        case AlignCommand.CENTER:
          options = {
            left: centerPoint.x,
            top: centerPoint.y
          };
          handleElement.set(options);
          break;
        default:
          break;
      }
    }
    canvas.setActiveObject(handleElement)
    canvas.renderAll()
    templatesStore.modifedElement(handleElement, options)
    
  }

  const layerElement = (command: LayerCommand) => {
    const [ canvas ] = useCanvas()
    const { setZindex } = useCanvasZindex()
    const handleElement = canvas.getActiveObject()
    const templatesStore = useTemplatesStore()
    if (!handleElement) return
    switch (command) {
      case LayerCommand.UP: 
        canvas.bringObjectForward(handleElement)
        break
      case LayerCommand.DOWN: 
        canvas.sendObjectBackwards(handleElement)
        break
      case LayerCommand.TOP: 
        canvas.bringObjectToFront(handleElement)
        break
      case LayerCommand.BOTTOM: 
        canvas.sendObjectToBack(handleElement)
        break
      default: break
    }
    setZindex(canvas)
    canvas.renderAll()
    templatesStore.modifedElement(handleElement, {})
  }

  return {
    alignElement,
    layerElement
  }
}