// ============================================================
// ===== 追加箇所：固定パス設定 開始 =====
// ============================================================

export const APP_CONFIG = {

    MODEL: {
        /*
         * ★通常はここだけ変更してください。
         * index.html から見たGLBフォルダのURLパスです。
         * 例: "./models/"
         * 例: "./data/buildingA/"
         */
        folderPath: "./models/",

        // タイル1.glb / タイル 1.glb の両方を確認します。
        tileName: "タイル",

        // 読み込み開始番号
        startIndex: 1,

        // 安全上の最大確認数
        maxTiles: 5000,

        // ReCap Z-up → Three.js Y-up の追加補正。必要な場合のみ true。
        recapZUpToThreeYUp: false
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

// ============================================================
// ===== 追加箇所：固定パス設定 終了 =====
// ============================================================
