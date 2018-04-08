import { Matrix4, Vector3, Quaternion } from 'three';
import { getWorldDistance, getWorldPosition } from './utils.js';

class IKJoint {
  /**
   * @param {THREE.Bone}
   * @param {IKJoint}
   */
  constructor(bone) {
    this.bone = bone;
    this.updateWorldPosition();

    this.distance = 0;

    this.isIKJoint = true;
  }

  /**
   * @param {THREE.Vector3}
   */
  setDistance(distance) {
    this.distance = distance;
  }

  updateMatrixWorld() {
    this.bone.updateMatrixWorld(true);
  }

  /**
   * @return {THREE.Vector3}
   */
  getWorldPosition() {
    return this._worldPosition;
  }

  updateWorldPosition() {
    this._worldPosition = getWorldPosition(this.bone, new Vector3());
  }

  setWorldPosition(position) {
    if ([position.x,position.y,position.z].some(n => Number.isNaN(n))) {
      debugger; throw new Error();
    }
    this._worldPosition.copy(position);
  }

  applyWorldPosition() {

    this.bone.position.copy(this.getWorldPosition());
    this.bone.updateMatrix();

    if (!this.bone.parent) {
      return;
    }
    this.bone.applyMatrix(new Matrix4().getInverse(this.bone.parent.matrixWorld));

    // Update the world matrix so the next joint can properly transform
    // with this world matrix
    this.bone.updateMatrixWorld();
  }

  /**
   * @param {IKJoint|THREE.Vector3}
   * @return {THREE.Vector3}
   */
  getWorldDistance(joint) {
    return this._worldPosition.distanceTo(joint.isIKJoint ? joint.getWorldPosition() : getWorldPosition(joint, new Vector3()));
  }
}

export default class IK {
  constructor(scene, bones, target) {
    bones[0].updateMatrixWorld(true);

    this.joints = [];

    for (let i = 0; i < bones.length; i++) {
      this.joints.push(new IKJoint(bones[i]));
    }

    for (let i = 0; i < this.joints.length - 1; i++) {
      const distance = this.joints[i].getWorldDistance(this.joints[i + 1])
      if (distance === 0) {
        throw new Error('bone with 0 distance between adjacent bone found');
      };
      this.joints[i].setDistance(distance);
    }

    this.totalLengths = this.joints.reduce((sum, joint) => joint.distance + sum, 0);

    this.root = this.joints[0];
    this.effector = this.joints[this.joints.length - 1];
    this.origin = new Vector3().copy(this.root.getWorldPosition());

    this.iterations = 100;
    this.tolerance = 0.01;
    this.target = target;


  }

  update() {
    this.root.updateMatrixWorld();
    this.target.updateMatrixWorld();

    // this.joints.map(j => console.log(new Vector3().setFromMatrixPosition(j.bone.matrixWorld)));

    this.joints.forEach(joint => joint.updateWorldPosition());
    // If target is out of reach
    if (this.totalLengths < this.root.getWorldDistance(this.target)) {
      this._solveOutOfRange();
    } else {
      this._solveInRange();
    }
    this.joints.forEach(joint => joint.applyWorldPosition());
  }

  /*
   * local bcount = 0;
   * local dif = (self.joints[self.n] - self.target).magnitude;
   * while dif > self.tolerance do -- check if within error margin
   *   self:backward();
   *   self:forward();
   *   dif = (self.joints[self.n] - self.target).magnitude;
   *   -- break if it's taking too long so the game doesn't freeze
   *   bcount = bcount + 1;
   *   if bcount > 10 then break; end;
   *   end;*/
  _solveInRange() {
    const targetPosition = new Vector3().setFromMatrixPosition(this.target.matrixWorld);

    // Update world position for all joints

    let iteration = 1;
    let difference = this.effector.getWorldDistance(this.target);
    while (difference > this.tolerance) {

      difference = this.effector.getWorldDistance(this.target);

      this.effector.setWorldPosition(targetPosition);
      for (let i = this.joints.length - 1; i > 0; i--) {
        const joint = this.joints[i];
        const prevJoint = this.joints[i - 1];
        const direction = new Vector3().subVectors(prevJoint.getWorldPosition(), joint.getWorldPosition()).normalize();
        prevJoint.setWorldPosition(direction.multiplyScalar(joint.distance).add(joint.getWorldPosition()));
      }

      this.root.setWorldPosition(this.origin);
      for (let i = 0; i < this.joints.length - 1; i++) {
        const joint = this.joints[i];
        const nextJoint = this.joints[i + 1];
        const direction = new Vector3().subVectors(nextJoint.getWorldPosition(), joint.getWorldPosition()).normalize();
        nextJoint.setWorldPosition(direction.multiplyScalar(nextJoint.distance).add(joint.getWorldPosition()));
      }

      iteration++;
      if (iteration > this.iterations) {
        break;
      }
    }

  }

  _solveOutOfRange() {
    const targetPosition = new Vector3().setFromMatrixPosition(this.target.matrixWorld);
    for (let i = 0; i < this.joints.length - 1; i++) {
      const joint = this.joints[i];
      const nextJoint = this.joints[i + 1];
      const r = joint.getWorldPosition().distanceTo(targetPosition);
      const lambda = joint.distance / r;

      const pos = new Vector3().copy(joint.getWorldPosition());
      const targetPos = new Vector3().copy(targetPosition);
      pos.multiplyScalar(1 - lambda).add(targetPos.multiplyScalar(lambda));
      nextJoint.setWorldPosition(pos);
    }
  }
}
