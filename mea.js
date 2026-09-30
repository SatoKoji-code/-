============================================================
【js/measurementRange.js 完全版】
============================================================

import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export class MeasurementRange {
    constructor({ scene, camera, renderer, controls, modelGroup }) {
        this.scene=scene; this.camera=camera; this.renderer=renderer;
        this.controls=controls; this.modelGroup=modelGroup;
        this.type=null; this.object=null;
        this.scaleDrag=null; this._adjustingScale=false;

        this.transform=new TransformControls(camera,renderer.domElement);
        this.transform.setSpace("local");
        this.transform.setMode("translate");
        this.scene.add(this.transform.getHelper());
        this.transform.getHelper().visible=false;

        this.transform.addEventListener("dragging-changed",e=>{
            this.controls.enabled=!e.value;
            if(e.value && this.transform.getMode()==="scale") this.beginOneSidedScale();
            else if(!e.value) this.scaleDrag=null;
        });

        this.transform.addEventListener("objectChange",()=>{
            if(this._adjustingScale || !this.object ||
               this.transform.getMode()!=="scale" || !this.scaleDrag) return;
            this.applyOneSidedScale();
        });
    }

    create(type="box"){
        this.removeObject();
        this.type=type;
        const box=new THREE.Box3().setFromObject(this.modelGroup);
        const center=box.getCenter(new THREE.Vector3());
        const size=box.getSize(new THREE.Vector3());
        const base=Math.max(Math.min(size.x||1,size.y||1,size.z||1),0.1);

        const geometry=type==="cylinder"
            ? new THREE.CylinderGeometry(0.5,0.5,1,64,1,true)
            : new THREE.BoxGeometry(1,1,1);

        const material=new THREE.MeshBasicMaterial({
            color:0x00d8ff, transparent:true, opacity:0.22,
            depthTest:false, depthWrite:false, side:THREE.DoubleSide
        });

        this.object=new THREE.Mesh(geometry,material);
        this.object.position.copy(center);
        this.object.scale.set(base,base,base);
        this.object.renderOrder=2000;
        this.object.userData.isMeasurementRange=true;
        this.scene.add(this.object);

        const edges=new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({
                color:0x00ffff,depthTest:false,depthWrite:false,
                transparent:true,opacity:1
            })
        );
        edges.renderOrder=2002;
        edges.userData.isMeasurementRangeVisual=true;
        this.object.add(edges);

        this.addDepthGuides(type);
        this.transform.attach(this.object);
        this.transform.getHelper().visible=true;
        return this.object;
    }

    addDepthGuides(type){
        const points=type==="cylinder"
            ? [0,-0.5,0, 0,0.5,0, -0.5,0,0, 0.5,0,0, 0,0,-0.5, 0,0,0.5]
            : [-0.5,0,0, 0.5,0,0, 0,-0.5,0, 0,0.5,0, 0,0,-0.5, 0,0,0.5];

        const g=new THREE.BufferGeometry();
        g.setAttribute("position",new THREE.Float32BufferAttribute(points,3));
        const m=new THREE.LineBasicMaterial({
            color:0xffffff,transparent:true,opacity:0.85,
            depthTest:false,depthWrite:false
        });
        const guides=new THREE.LineSegments(g,m);
        guides.renderOrder=2003;
        guides.userData.isMeasurementRangeVisual=true;
        this.object.add(guides);

        if(type==="box"){
            const mg=new THREE.SphereGeometry(0.018,12,8);
            const mm=new THREE.MeshBasicMaterial({
                color:0xffffff,depthTest:false,depthWrite:false
            });
            const front=new THREE.Mesh(mg,mm);
            front.position.set(0,0,0.5); front.renderOrder=2004;
            const back=new THREE.Mesh(mg.clone(),mm.clone());
            back.position.set(0,0,-0.5); back.renderOrder=2004;
            this.object.add(front,back);
        }
    }

    setMode(mode){
        if(!this.object || !["translate","rotate","scale"].includes(mode)) return;
        this.scaleDrag=null;
        this.transform.setMode(mode);
    }

    beginOneSidedScale(){
        if(!this.object) return;
        const t=String(this.transform.axis||"");
        const axis=t==="X"?"x":t==="Y"?"y":t==="Z"?"z":null;
        if(!axis){ this.scaleDrag=null; return; }

        this.object.updateMatrixWorld(true);
        const pos=this.object.position.clone();
        const scale=this.object.scale.clone();
        const quat=this.object.quaternion.clone();
        const localAxis=axis==="x"?new THREE.Vector3(1,0,0):
                        axis==="y"?new THREE.Vector3(0,1,0):
                                   new THREE.Vector3(0,0,1);
        const worldAxis=localAxis.applyQuaternion(quat).normalize();
        const length=Math.abs(scale[axis]);

        // 操作側と反対の面を固定点として保持
        const fixedPoint=pos.clone().addScaledVector(worldAxis,-length*0.5);
        this.scaleDrag={axis,worldAxis,fixedPoint};
    }

    applyOneSidedScale(){
        const d=this.scaleDrag;
        if(!d || !this.object) return;
        const length=Math.max(Math.abs(this.object.scale[d.axis]),1e-6);
        const newPos=d.fixedPoint.clone().addScaledVector(d.worldAxis,length*0.5);
        this._adjustingScale=true;
        this.object.position.copy(newPos);
        this.object.updateMatrixWorld(true);
        this._adjustingScale=false;
    }

    getRange(){
        if(!this.object || !this.type) return null;
        this.object.updateMatrixWorld(true);
        return {
            type:this.type,
            matrixWorld:this.object.matrixWorld.clone(),
            inverseMatrixWorld:this.object.matrixWorld.clone().invert()
        };
    }

    removeObject(){
        if(!this.object) return;
        this.scaleDrag=null;
        this.transform.detach();
        this.scene.remove(this.object);
        this.object.traverse(o=>{
            o.geometry?.dispose?.();
            if(Array.isArray(o.material)) o.material.forEach(m=>m?.dispose?.());
            else o.material?.dispose?.();
        });
        this.object=null; this.type=null;
        this.transform.getHelper().visible=false;
    }

    clear(){ this.removeObject(); }
}


============================================================
【変更内容】
============================================================

1. X/Y/Zの単軸Scale操作を片面リサイズ化
   ・操作方向と反対側の面を固定
   ・サイズ変更に合わせて中心位置を自動補正

2. 範囲ボックスの視認性改善
   ・半透明面 opacity 0.22
   ・外周線を明確化
   ・内部にX/Y/Z方向の白いガイド線
   ・ボックス前後中央に白いマーカー
   ・depthWrite:false でモデルを隠しにくく設定

3. 移動・回転・表面積計算方式は従来のまま
   areaMeasurement.js の変更は不要です。

【入れ替え】
この measurementRange.js 全文で、
現在の js/measurementRange.js を置き換えてください。
