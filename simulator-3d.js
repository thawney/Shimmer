(function(global) {
  'use strict';

  function createShimmerSimulator3D(opts) {
    var canvas = opts.canvas;
    var gridStageEl = opts.gridStageEl;
    var threeStageEl = opts.threeStageEl;
    var enable3DEl = opts.enable3DEl;
    var sensorState = opts.sensorState;
    var clamp = opts.clamp;
    var setStatus = opts.setStatus;
    var updateSensorReadout = opts.updateSensorReadout;
    var resetSensorState = opts.resetSensorState;

    var AXES = ['x', 'y', 'z'];
    var sim3D = {
      ready: false,
      enabled: false,
      dragging: false,
      pointerId: null,
      lastClientX: 0,
      lastClientY: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      renderPitch: 0,
      renderYaw: 0,
      renderRoll: 0,
      targetPitch: 0,
      targetYaw: 0,
      targetRoll: 0,
      axisLock: null,
      shakeTime: 0,
      shakeDuration: 560,
      lastPitch: 0,
      lastYaw: 0,
      lastRoll: 0,
      lastFrameTs: 0,
      renderer: null,
      axisRenderer: null,
      scene: null,
      camera: null,
      deviceGroup: null,
      axisScene: null,
      axisCamera: null,
      axisRoot: null,
      axisArrows: null,
      axisLabels: null,
      baseQuat: null,
      localEuler: null,
      localQuat: null,
      renderQuat: null,
      sensorQuat: null,
      sensorInvQuat: null,
      sensorGravity: null,
      sensorLocalGravity: null,
      texture: null,
      raycaster: null,
      pointer: null,
      interactiveMeshes: [],
    };

    function report3DError(msg) {
      if (enable3DEl) {
        enable3DEl.checked = false;
        enable3DEl.title = msg || '';
      }
      setStatus(msg, 'error');
    }

    function notifyTextureUpdate() {
      if (sim3D.texture) sim3D.texture.needsUpdate = true;
    }

    function focus3DStage() {
      if (!threeStageEl || threeStageEl.tabIndex < 0) return;
      try {
        threeStageEl.focus({ preventScroll: true });
      } catch (e) {
        threeStageEl.focus();
      }
    }

    function apply3DPose(pitch, yaw, roll) {
      sim3D.pitch = pitch;
      sim3D.yaw = yaw;
      sim3D.roll = roll;
      sim3D.renderPitch = pitch;
      sim3D.renderYaw = yaw;
      sim3D.renderRoll = roll;
      sim3D.targetPitch = pitch;
      sim3D.targetYaw = yaw;
      sim3D.targetRoll = roll;
      sim3D.lastPitch = pitch;
      sim3D.lastYaw = yaw;
      sim3D.lastRoll = roll;
    }

    function get3DFrontFacingQuat() {
      if (!sim3D.camera || !sim3D.deviceGroup || !global.THREE) return null;

      var faceNormal = sim3D.camera.position.clone().sub(sim3D.deviceGroup.position).normalize();
      var panelUp = sim3D.camera.up.clone().projectOnPlane(faceNormal);
      if (panelUp.lengthSq() < 0.000001) panelUp.set(0, 1, 0).projectOnPlane(faceNormal);
      if (panelUp.lengthSq() < 0.000001) panelUp.set(0, 0, -1).projectOnPlane(faceNormal);
      panelUp.normalize();

      var zAxis = panelUp.clone().multiplyScalar(-1);
      var xAxis = new THREE.Vector3().crossVectors(faceNormal, zAxis);
      if (xAxis.lengthSq() < 0.000001) xAxis.set(1, 0, 0);
      xAxis.normalize();

      return new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(xAxis, faceNormal, zAxis)
      );
    }

    function sync3DRenderQuaternion() {
      if (!sim3D.baseQuat || !sim3D.localEuler || !sim3D.localQuat || !sim3D.renderQuat) {
        return false;
      }

      sim3D.localEuler.set(sim3D.renderPitch, sim3D.renderYaw, -sim3D.renderRoll, 'XYZ');
      sim3D.localQuat.setFromEuler(sim3D.localEuler);
      sim3D.renderQuat.copy(sim3D.baseQuat).multiply(sim3D.localQuat);
      return true;
    }

    function writeSensorsFromRenderPose(resetMotion) {
      if (!sim3D.sensorQuat || !sim3D.sensorInvQuat || !sim3D.sensorLocalGravity) {
        resetSensorState();
        return;
      }

      if (!sync3DRenderQuaternion()) {
        resetSensorState();
        return;
      }

      sim3D.sensorQuat.copy(sim3D.renderQuat);
      sim3D.sensorInvQuat.copy(sim3D.renderQuat).invert();
      sim3D.sensorLocalGravity.copy(sim3D.sensorGravity).applyQuaternion(sim3D.sensorInvQuat);

      sensorState.accelX = clamp(Math.round(-sim3D.sensorLocalGravity.z * 64), -128, 127);
      sensorState.accelY = clamp(Math.round(sim3D.sensorLocalGravity.x * 64), -128, 127);
      sensorState.accelZ = clamp(Math.round(-sim3D.sensorLocalGravity.y * 64), -128, 127);
      if (resetMotion) sensorState.motion = 0;
      updateSensorReadout();
    }

    function reset3DPose() {
      if (threeStageEl && sim3D.pointerId != null && threeStageEl.releasePointerCapture) {
        try {
          if (threeStageEl.hasPointerCapture && threeStageEl.hasPointerCapture(sim3D.pointerId)) {
            threeStageEl.releasePointerCapture(sim3D.pointerId);
          }
        } catch (e) {}
      }

      sim3D.dragging = false;
      sim3D.pointerId = null;
      apply3DPose(0, 0, 0);
      sim3D.axisLock = null;
      sim3D.shakeTime = 0;
      sim3D.lastFrameTs = 0;
      if (gridStageEl) gridStageEl.classList.remove('is-dragging');
      updateAxisWidgetState();
      if (sim3D.ready) writeSensorsFromRenderPose(true);
    }

    function trigger3DShake() {
      sim3D.shakeTime = sim3D.shakeDuration;
    }

    function clear3DAxisLock() {
      sim3D.axisLock = null;
      updateAxisWidgetState();
    }

    function updateAxisWidgetState() {
      if (!sim3D.axisArrows || !sim3D.axisLabels) return;

      AXES.forEach(function(axis) {
        var arrow = sim3D.axisArrows[axis];
        var label = sim3D.axisLabels[axis];
        if (!arrow || !label) return;

        var highlighted = sim3D.axisLock === axis;
        var dimmed = !!sim3D.axisLock && !highlighted;
        var opacity = highlighted ? 1.0 : (dimmed ? 0.26 : 0.88);
        var scale = highlighted ? 1.08 : 1.0;
        var lineOpacity = highlighted ? 1.0 : (dimmed ? 0.22 : 0.72);

        arrow.group.scale.setScalar(scale);
        arrow.arc.material.opacity = opacity;
        arrow.head.material.opacity = opacity;
        arrow.guide.material.opacity = lineOpacity;

        label.visible = !sim3D.axisLock || highlighted;
        label.material.opacity = highlighted ? 1.0 : 0.94;
        label.scale.setScalar(highlighted ? 0.62 : 0.56);
      });
    }

    function apply3DDrag(dx, dy) {
      var lock = sim3D.axisLock;

      if (lock === 'x') {
        sim3D.targetPitch = clamp(sim3D.targetPitch + dy * 0.0085, -1.45, 1.45);
        return;
      }

      if (lock === 'y') {
        sim3D.targetYaw = clamp(sim3D.targetYaw + dx * 0.0085, -1.45, 1.45);
        return;
      }

      if (lock === 'z') {
        sim3D.targetRoll = clamp(sim3D.targetRoll + dx * 0.0085, -1.45, 1.45);
        return;
      }

      sim3D.targetRoll  = clamp(sim3D.targetRoll  + dx * 0.0085, -1.45, 1.45);
      sim3D.targetPitch = clamp(sim3D.targetPitch + dy * 0.0085, -1.45, 1.45);
    }

    function set3DEnabled(enabled) {
      sim3D.enabled = !!enabled && sim3D.ready;
      if (enable3DEl) enable3DEl.checked = sim3D.enabled;
      if (gridStageEl) gridStageEl.classList.toggle('is-3d', sim3D.enabled);
      if (threeStageEl) threeStageEl.tabIndex = sim3D.enabled ? 0 : -1;

      if (!sim3D.enabled) {
        reset3DPose();
        if (threeStageEl && document.activeElement === threeStageEl) threeStageEl.blur();
        resetSensorState();
      } else {
        reset3DPose();
        sim3D.lastFrameTs = 0;
        updateAxisWidgetState();
        focus3DStage();
      }

      render3DScene();
    }

    function sync3DSensorState(dtMs) {
      var dt = Math.max(1, dtMs || 16);
      var smoothing = sim3D.dragging ? 1 : Math.min(1, dt / 24);

      sim3D.pitch += (sim3D.targetPitch - sim3D.pitch) * smoothing;
      sim3D.yaw += (sim3D.targetYaw - sim3D.yaw) * smoothing;
      sim3D.roll += (sim3D.targetRoll - sim3D.roll) * smoothing;

      if (Math.abs(sim3D.targetPitch - sim3D.pitch) < 0.0001) sim3D.pitch = sim3D.targetPitch;
      if (Math.abs(sim3D.targetYaw - sim3D.yaw) < 0.0001) sim3D.yaw = sim3D.targetYaw;
      if (Math.abs(sim3D.targetRoll - sim3D.roll) < 0.0001) sim3D.roll = sim3D.targetRoll;

      var shakePitch = 0;
      var shakeYaw = 0;
      var shakeRoll = 0;
      if (sim3D.shakeTime > 0) {
        var progress = 1.0 - (sim3D.shakeTime / sim3D.shakeDuration);
        var envelope = (sim3D.shakeTime / sim3D.shakeDuration);
        var time = progress * 0.72;
        shakePitch = Math.sin(time * 32.0) * 0.18 * envelope;
        shakeYaw   = Math.sin(time * 37.0 + 0.35) * 0.12 * envelope;
        shakeRoll  = Math.sin(time * 41.0 + 0.9) * 0.16 * envelope;
        sim3D.shakeTime = Math.max(0, sim3D.shakeTime - dt);
      }

      sim3D.renderPitch = clamp(sim3D.pitch + shakePitch, -1.45, 1.45);
      sim3D.renderYaw   = clamp(sim3D.yaw + shakeYaw, -1.45, 1.45);
      sim3D.renderRoll  = clamp(sim3D.roll + shakeRoll, -1.45, 1.45);

      writeSensorsFromRenderPose(false);

      var deltaPitch = sim3D.renderPitch - sim3D.lastPitch;
      var deltaYaw   = sim3D.renderYaw   - sim3D.lastYaw;
      var deltaRoll  = sim3D.renderRoll  - sim3D.lastRoll;
      var angularSpeed = Math.sqrt(deltaPitch * deltaPitch + deltaYaw * deltaYaw + deltaRoll * deltaRoll) / (dt / 1000);
      var motionBoost = clamp(Math.round(angularSpeed * 36), 0, 255);
      var decayedMotion = Math.round(sensorState.motion * Math.exp(-dt / 170));
      sensorState.motion = motionBoost > decayedMotion ? motionBoost : decayedMotion;

      sim3D.lastPitch = sim3D.renderPitch;
      sim3D.lastYaw   = sim3D.renderYaw;
      sim3D.lastRoll  = sim3D.renderRoll;
      updateSensorReadout();
    }

    function render3DScene() {
      if (!sim3D.ready) return;
      if (!sync3DRenderQuaternion()) return;

      sim3D.deviceGroup.quaternion.copy(sim3D.renderQuat);
      sim3D.renderer.render(sim3D.scene, sim3D.camera);

      if (sim3D.axisRenderer && sim3D.axisScene && sim3D.axisCamera && sim3D.axisRoot) {
        sim3D.axisRoot.quaternion.copy(sim3D.renderQuat);
        sim3D.axisRenderer.render(sim3D.axisScene, sim3D.axisCamera);
      }
    }

    function resize3DScene() {
      if (!sim3D.ready || !threeStageEl) return;

      var rect = threeStageEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      sim3D.camera.aspect = rect.width / rect.height;
      sim3D.camera.updateProjectionMatrix();
      sim3D.renderer.setPixelRatio(global.devicePixelRatio || 1);
      sim3D.renderer.setSize(rect.width, rect.height, false);

      if (sim3D.axisRenderer && sim3D.axisCamera) {
        var axisSize = clamp(Math.round(Math.min(rect.width, rect.height) * 0.11), 76, 96);
        sim3D.axisCamera.aspect = 1;
        sim3D.axisCamera.updateProjectionMatrix();
        sim3D.axisRenderer.setPixelRatio(global.devicePixelRatio || 1);
        sim3D.axisRenderer.setSize(axisSize, axisSize, false);
      }

      render3DScene();
    }

    function isPointerOnDevice(event) {
      if (!sim3D.ready || !threeStageEl) return false;

      var rect = threeStageEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;

      sim3D.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      sim3D.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      sim3D.raycaster.setFromCamera(sim3D.pointer, sim3D.camera);

      return sim3D.raycaster.intersectObjects(sim3D.interactiveMeshes, false).length > 0;
    }

    function on3DPointerDown(event) {
      if (!sim3D.enabled || event.button !== 0) return;

      focus3DStage();
      if (!isPointerOnDevice(event)) return;

      sim3D.dragging = true;
      sim3D.pointerId = event.pointerId;
      sim3D.lastClientX = event.clientX;
      sim3D.lastClientY = event.clientY;

      if (gridStageEl) gridStageEl.classList.add('is-dragging');
      if (threeStageEl && threeStageEl.setPointerCapture) {
        try { threeStageEl.setPointerCapture(event.pointerId); } catch (e) {}
      }

      event.preventDefault();
    }

    function on3DPointerMove(event) {
      if (!sim3D.dragging || event.pointerId !== sim3D.pointerId) return;

      var dx = event.clientX - sim3D.lastClientX;
      var dy = event.clientY - sim3D.lastClientY;
      sim3D.lastClientX = event.clientX;
      sim3D.lastClientY = event.clientY;

      apply3DDrag(dx, dy);
    }

    function end3DDrag(event) {
      if (!sim3D.dragging) return;
      if (event && event.pointerId != null && sim3D.pointerId != null && event.pointerId !== sim3D.pointerId) return;

      if (threeStageEl && sim3D.pointerId != null && threeStageEl.releasePointerCapture) {
        try {
          if (threeStageEl.hasPointerCapture && threeStageEl.hasPointerCapture(sim3D.pointerId)) {
            threeStageEl.releasePointerCapture(sim3D.pointerId);
          }
        } catch (e) {}
      }

      sim3D.dragging = false;
      sim3D.pointerId = null;
      if (gridStageEl) gridStageEl.classList.remove('is-dragging');
    }

    function on3DKeyDown(event) {
      if (!sim3D.enabled) return;

      var key = event.key ? event.key.toLowerCase() : '';
      if (event.repeat && (key === 'x' || key === 'y' || key === 'z' || key === 'r' || key === 's')) {
        event.preventDefault();
        return;
      }

      if (key === 'x' || key === 'y' || key === 'z') {
        reset3DPose();
        sim3D.axisLock = key;
        updateAxisWidgetState();
        render3DScene();
        event.preventDefault();
        return;
      }

      if (key === 'r') {
        reset3DPose();
        render3DScene();
        event.preventDefault();
        return;
      }

      if (key === 's') {
        trigger3DShake();
        event.preventDefault();
      }
    }

    function on3DKeyUp(event) {
      var key = event.key ? event.key.toLowerCase() : '';
      if (key === sim3D.axisLock) {
        clear3DAxisLock();
        event.preventDefault();
      }
    }

    function on3DBlur() {
      clear3DAxisLock();
    }

    function step3DScene(ts) {
      if (sim3D.ready && sim3D.enabled) {
        var dt = sim3D.lastFrameTs ? Math.min(48, ts - sim3D.lastFrameTs) : 16;
        sim3D.lastFrameTs = ts;
        sync3DSensorState(dt);
        render3DScene();
      }

      global.requestAnimationFrame(step3DScene);
    }

    function makeLabelSprite(text, color, position) {
      var labelCanvas = document.createElement('canvas');
      labelCanvas.width = 192;
      labelCanvas.height = 192;

      var labelCtx = labelCanvas.getContext('2d');
      if (labelCtx) {
        var ringColor = '#' + new THREE.Color(color).getHexString();
        var textColor = '#' + new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3).getHexString();

        labelCtx.clearRect(0, 0, 192, 192);
        labelCtx.fillStyle = 'rgba(5, 5, 5, 0.72)';
        labelCtx.strokeStyle = ringColor;
        labelCtx.lineWidth = 12;
        labelCtx.beginPath();
        labelCtx.arc(96, 96, 58, 0, Math.PI * 2);
        labelCtx.fill();
        labelCtx.stroke();

        labelCtx.font = '700 82px "Anonymous Pro", monospace';
        labelCtx.textAlign = 'center';
        labelCtx.textBaseline = 'middle';
        labelCtx.fillStyle = textColor;
        labelCtx.fillText(text.toUpperCase(), 96, 101);
      }

      var texture = new THREE.CanvasTexture(labelCanvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      var material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        depthTest: false,
      });
      var sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.scale.set(0.56, 0.56, 1);
      return sprite;
    }

    function ensure3DSimulator() {
      if (sim3D.ready) return true;
      if (!gridStageEl || !threeStageEl || !enable3DEl) return false;

      if (!global.THREE) {
        report3DError('3D view unavailable: Three.js failed to load');
        return false;
      }

      try {
        threeStageEl.innerHTML = '';

        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = 'sim-3d-main-canvas';
        threeStageEl.appendChild(renderer.domElement);

        var axisRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        axisRenderer.setClearColor(0x000000, 0);
        if ('outputColorSpace' in axisRenderer && THREE.SRGBColorSpace) axisRenderer.outputColorSpace = THREE.SRGBColorSpace;
        axisRenderer.domElement.className = 'sim-3d-axis-canvas';
        axisRenderer.domElement.setAttribute('aria-hidden', 'true');
        threeStageEl.appendChild(axisRenderer.domElement);

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
        camera.position.set(3.0, 2.45, 3.1);
        camera.lookAt(0, 0.22, 0);

        scene.add(new THREE.HemisphereLight(0xf7edc9, 0x090909, 1.5));

        var keyLight = new THREE.DirectionalLight(0xffe2a1, 1.35);
        keyLight.position.set(3.4, 5.0, 2.2);
        scene.add(keyLight);

        var rimLight = new THREE.DirectionalLight(0x8db7ff, 0.35);
        rimLight.position.set(-3.0, 2.0, -2.5);
        scene.add(rimLight);

        var shadow = new THREE.Mesh(
          new THREE.CircleGeometry(4.6, 64),
          new THREE.MeshBasicMaterial({
            color: 0x110f0d,
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
          })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0, -1.9, 0.18);
        shadow.renderOrder = -10;
        scene.add(shadow);

        var deviceGroup = new THREE.Group();
        deviceGroup.position.y = 0.22;
        scene.add(deviceGroup);

        var body = new THREE.Mesh(
          new THREE.BoxGeometry(2.36, 0.28, 2.36),
          new THREE.MeshStandardMaterial({
            color: 0x171717,
            metalness: 0.12,
            roughness: 0.74,
          })
        );
        deviceGroup.add(body);

        var bezel = new THREE.Mesh(
          new THREE.BoxGeometry(2.12, 0.04, 2.12),
          new THREE.MeshStandardMaterial({
            color: 0x060606,
            metalness: 0.08,
            roughness: 0.92,
          })
        );
        bezel.position.y = 0.14;
        deviceGroup.add(bezel);

        var edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(2.36, 0.28, 2.36)),
          new THREE.LineBasicMaterial({ color: 0x55451a, transparent: true, opacity: 0.55 })
        );
        deviceGroup.add(edges);

        var texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

        var panel = new THREE.Mesh(
          new THREE.PlaneGeometry(2.0, 2.0),
          new THREE.MeshBasicMaterial({ map: texture })
        );
        panel.rotation.x = -Math.PI / 2;
        panel.position.y = 0.161;
        deviceGroup.add(panel);

        sim3D.renderer = renderer;
        sim3D.axisRenderer = axisRenderer;
        sim3D.scene = scene;
        sim3D.camera = camera;
        sim3D.deviceGroup = deviceGroup;

        var axisScene = new THREE.Scene();
        var axisCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 10);
        axisCamera.position.copy(
          camera.position.clone().sub(deviceGroup.position).normalize().multiplyScalar(4.4)
        );
        axisCamera.up.copy(camera.up);
        axisCamera.lookAt(0, 0, 0);

        function makeGyroAxis(color, rotation, phase) {
          var group = new THREE.Group();
          var ring = new THREE.Group();
          var guide = new THREE.Mesh(
            new THREE.TorusGeometry(1.02, 0.012, 10, 96),
            new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.2 })
          );
          var arcSpan = Math.PI * 1.68;
          var arc = new THREE.Mesh(
            new THREE.TorusGeometry(1.02, 0.04, 12, 96, arcSpan),
            new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.92 })
          );
          var endAngle = arcSpan;
          var head = new THREE.Mesh(
            new THREE.ConeGeometry(0.11, 0.26, 18),
            new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.92 })
          );
          head.position.set(Math.cos(endAngle) * 1.02, Math.sin(endAngle) * 1.02, 0);
          head.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(-Math.sin(endAngle), Math.cos(endAngle), 0).normalize()
          );

          ring.rotation.z = phase || 0;
          ring.add(guide);
          ring.add(arc);
          ring.add(head);
          group.add(ring);
          if (rotation) group.rotation.copy(rotation);

          return {
            group: group,
            guide: guide,
            arc: arc,
            head: head,
          };
        }

        var axisRoot = new THREE.Group();
        var axisShell = new THREE.Mesh(
          new THREE.SphereGeometry(1.08, 28, 20),
          new THREE.MeshBasicMaterial({ color: 0xbababa, wireframe: true, transparent: true, opacity: 0.12 })
        );
        var axisOrigin = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 20, 20),
          new THREE.MeshBasicMaterial({ color: 0xf4ead2, transparent: true, opacity: 0.95 })
        );
        var axisDevice = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.08, 0.38),
          new THREE.MeshBasicMaterial({ color: 0xf6e8bc, transparent: true, opacity: 0.18 })
        );
        axisRoot.add(axisShell);
        axisRoot.add(axisOrigin);
        axisRoot.add(axisDevice);

        var axisArrows = {
          x: makeGyroAxis(0xff6b6b, new THREE.Euler(0, Math.PI / 2, 0), Math.PI * 0.18),
          y: makeGyroAxis(0x6bff9e, new THREE.Euler(Math.PI / 2, 0, 0), Math.PI * 0.92),
          z: makeGyroAxis(0x6bb4ff, new THREE.Euler(0, 0, 0), Math.PI * 1.44),
        };
        axisRoot.add(axisArrows.x.group);
        axisRoot.add(axisArrows.y.group);
        axisRoot.add(axisArrows.z.group);

        var axisLabels = {
          x: makeLabelSprite('X', 0xff6b6b, new THREE.Vector3(1.18, 0, 0)),
          y: makeLabelSprite('Y', 0x6bff9e, new THREE.Vector3(0, 1.18, 0)),
          z: makeLabelSprite('Z', 0x6bb4ff, new THREE.Vector3(0, 0, 1.18)),
        };
        axisRoot.add(axisLabels.x);
        axisRoot.add(axisLabels.y);
        axisRoot.add(axisLabels.z);
        axisScene.add(axisRoot);

        sim3D.axisScene = axisScene;
        sim3D.axisCamera = axisCamera;
        sim3D.axisRoot = axisRoot;
        sim3D.axisArrows = axisArrows;
        sim3D.axisLabels = axisLabels;
        sim3D.baseQuat = get3DFrontFacingQuat() || new THREE.Quaternion();
        sim3D.localEuler = new THREE.Euler(0, 0, 0, 'XYZ');
        sim3D.localQuat = new THREE.Quaternion();
        sim3D.renderQuat = new THREE.Quaternion().copy(sim3D.baseQuat);
        sim3D.sensorQuat = new THREE.Quaternion();
        sim3D.sensorInvQuat = new THREE.Quaternion();
        sim3D.sensorGravity = new THREE.Vector3(0, -1, 0);
        sim3D.sensorLocalGravity = new THREE.Vector3();
        sim3D.texture = texture;
        sim3D.raycaster = new THREE.Raycaster();
        sim3D.pointer = new THREE.Vector2();
        sim3D.interactiveMeshes = [body, bezel, panel];
        sim3D.ready = true;
        enable3DEl.title = '';
        reset3DPose();

        threeStageEl.addEventListener('pointerdown', on3DPointerDown);
        threeStageEl.addEventListener('pointermove', on3DPointerMove);
        threeStageEl.addEventListener('pointerup', end3DDrag);
        threeStageEl.addEventListener('pointercancel', end3DDrag);
        threeStageEl.addEventListener('lostpointercapture', end3DDrag);
        threeStageEl.addEventListener('keydown', on3DKeyDown);
        threeStageEl.addEventListener('keyup', on3DKeyUp);
        threeStageEl.addEventListener('blur', on3DBlur);

        if (global.ResizeObserver) {
          new ResizeObserver(resize3DScene).observe(threeStageEl);
        } else {
          global.addEventListener('resize', resize3DScene);
        }

        resize3DScene();
        render3DScene();
        global.requestAnimationFrame(step3DScene);
        return true;
      } catch (err) {
        sim3D.ready = false;
        sim3D.renderer = null;
        sim3D.axisRenderer = null;
        sim3D.scene = null;
        sim3D.camera = null;
        sim3D.deviceGroup = null;
        sim3D.axisScene = null;
        sim3D.axisCamera = null;
        sim3D.axisRoot = null;
        sim3D.axisArrows = null;
        sim3D.axisLabels = null;
        sim3D.baseQuat = null;
        sim3D.localEuler = null;
        sim3D.localQuat = null;
        sim3D.renderQuat = null;
        sim3D.sensorQuat = null;
        sim3D.sensorInvQuat = null;
        sim3D.sensorGravity = null;
        sim3D.sensorLocalGravity = null;
        sim3D.texture = null;
        sim3D.raycaster = null;
        sim3D.pointer = null;
        sim3D.interactiveMeshes = [];
        threeStageEl.innerHTML = '';
        report3DError('3D view unavailable: ' + (err && err.message ? err.message : 'WebGL init failed'));
        return false;
      }
    }

    function initControls() {
      if (!enable3DEl) return;

      enable3DEl.addEventListener('change', function() {
        if (enable3DEl.checked) {
          if (!ensure3DSimulator()) return;
          set3DEnabled(true);
          return;
        }

        set3DEnabled(false);
      });
    }

    return {
      initControls: initControls,
      notifyTextureUpdate: notifyTextureUpdate,
    };
  }

  global.createShimmerSimulator3D = createShimmerSimulator3D;
})(window);
