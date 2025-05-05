export class ColorScale {
    constructor(name = "Custom Scale") {
      this.name = name;
      this.steps = [];
      this.maxSteps = 256;
      this.rgbaScale = new Array(this.maxSteps);
    }
  
    addStep(relativePos, r, g, b) {
      if (relativePos < 0 || relativePos > 1) {
        console.warn(`Invalid relative position: ${relativePos}`);
        return;
      }
      this.steps.push({ pos: relativePos, color: [r, g, b] });
      this.steps.sort((a, b) => a.pos - b.pos);
    }
  
    generate() {
      if (this.steps.length < 2) {
        console.warn("At least two steps are required to generate a color scale");
        for (let i = 0; i < this.maxSteps; i++) this.rgbaScale[i] = [0, 0, 0];
        return;
      }
  
      for (let i = 0; i < this.maxSteps; i++) {
        const t = i / (this.maxSteps - 1);
        const step = this.getInterpolatedColor(t);
        this.rgbaScale[i] = step;
      }
    }
  
    getInterpolatedColor(t) {
      const steps = this.steps;
      let i = 0;
      while (i + 1 < steps.length && steps[i + 1].pos < t) {
        i++;
      }
  
      const s1 = steps[i];
      const s2 = steps[Math.min(i + 1, steps.length - 1)];
      const localT = (t - s1.pos) / Math.max(s2.pos - s1.pos, 1e-6);
  
      const lerp = (a, b, t) => a + (b - a) * t;
      return [
        lerp(s1.color[0], s2.color[0], localT),
        lerp(s1.color[1], s2.color[1], localT),
        lerp(s1.color[2], s2.color[2], localT),
      ];
    }
  
    getColor(valueNorm) {
      const clamped = Math.max(0, Math.min(1, valueNorm));
      const idx = Math.floor(clamped * (this.maxSteps - 1));
      return this.rgbaScale[idx];
    }
  }
  