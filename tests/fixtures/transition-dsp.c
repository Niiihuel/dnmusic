#include <assert.h>
#include <math.h>
#include <stdio.h>
#include "DNTransitionDSP.h"

static DNCrossfadeCurve constant(double value) {
  DNCrossfadeCurve curve = {.count = 2, .times = {0, 1}, .values = {value, value}};
  return curve;
}

static double rms(DNTransitionSettings settings, double frequency, double startAt) {
  DNTransitionDSP dsp;
  DNTPrepare(&dsp, 48000);
  DNTSetSettings(&dsp, &settings, 1);
  double square = 0;
  for (int frame = 0; frame < 8192; frame++) {
    const double time = startAt + (double)frame / 48000;
    const float input = (float)(0.2 * sin(2 * DN_EQ_PI * frequency * frame / 48000));
    DNTBeginFrame(&dsp, time, 0, 1);
    const float output = DNTProcessSample(&dsp, 0, input);
    assert(isfinite(output) && fabs(output) <= 1);
    if (frame >= 4096) square += output * output;
  }
  return sqrt(square / 4096);
}

int main(void) {
  DNTransitionDSP dsp;
  DNTransitionSettings settings = {0};
  DNTPrepare(&dsp, 48000);
  settings.filterKind = 1;
  settings.cutoff = constant(400);
  DNTSetSettings(&dsp, &settings, 0);
  for (int frame = 0; frame < 1000; frame++) DNTBeginFrame(&dsp, frame / 48000.0, 0, 1);
  assert(!dsp.active && dsp.step == 0);
  assert(DNTProcessSample(&dsp, 0, 0.4f) == 0.4f);
  DNTSetSettings(&dsp, &settings, 2);
  assert(!dsp.active);
  DNTSetSettings(&dsp, &settings, 1);
  assert(dsp.active);
  DNTBeginFrame(&dsp, 0, 0, 1);
  assert(dsp.step == 1);
  DNTSetSettings(&dsp, &settings, 0);
  assert(!dsp.active && DNTProcessSample(&dsp, 0, 0.4f) == 0.4f);

  const double lowpassBass = rms(settings, 100, 0);
  const double lowpassHigh = rms(settings, 5000, 0);
  assert(lowpassBass > lowpassHigh * 6);
  settings.filterKind = 2;
  const double highpassBass = rms(settings, 100, 0);
  const double highpassHigh = rms(settings, 5000, 0);
  assert(highpassHigh > highpassBass * 6);

  settings = (DNTransitionSettings){0};
  settings.eqEnabled = true;
  settings.eq[0] = constant(12);
  settings.eq[1] = constant(0);
  settings.eq[2] = constant(0);
  const double boostedBass = rms(settings, 100, 0);
  const double distantHigh = rms(settings, 8000, 0);
  assert(boostedBass > distantHigh * 2);

  settings = (DNTransitionSettings){0};
  settings.filterKind = 1;
  settings.cutoff = (DNCrossfadeCurve){.count = 2,
    .times = {0, 1}, .values = {20000, 100}};
  assert(rms(settings, 8000, 0.02) > rms(settings, 8000, 0.83) * 3);
  puts("Transition EQ/filter DSP OK");
}
