// ===== 追加箇所：設定ファイル 開始 =====

export const APP_CONFIG = {

    MODEL: {

        /*
         * true:
         * ReCap Z-up → Three.js Y-up に補正
         *
         * GLB側ですでにY-upになっている場合は false
         */
        recapZUpToThreeYUp: false,

        /*
         * 対応ファイル名:
         *
         * タイル1.glb
         * タイル2.glb
         *
         * タイル 1.glb
         * タイル 2.glb
         *
         * 大文字小文字は区別しません。
         */
        tileName: "タイル",

        /*
         * 何番から読むか
         */
        startIndex: 1,

        /*
         * 安全上の最大タイル数
         */
        maxTiles: 5000,

        /*
         * true:
         * 最初の欠番で読み込み終了
         *
         * 1,2,3,5 がある場合 → 1～3のみ
         */
        stopAtFirstMissing: true
    },

    VIEW: {
        background: 0x20242b,

        ambientLightIntensity: 1.5,
        hemisphereLightIntensity: 1.1,
        directionalLightIntensity: 1.2,

        rotateSpeed: 0.55,
        zoomSpeed: 1.0,
        panSpeed: 0.8,

        fov: 50,
        near: 0.01,
        far: 1000000,

        showAxes: true
    },

    MEASUREMENT: {
        unit: "m",
        decimals: 3,

        pointColor: 0xff4d4d,
        lineColor: 0xff4d4d,

        clickMoveTolerance: 5,
        pointSizeRatio: 0.004
    }
};

// ===== 追加箇所：設定ファイル 終了 =====
