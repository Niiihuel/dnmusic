#include <assert.h>
#include <stdio.h>
#include "DNEqualizerDSP.h"

static void settle(DNEqualizerDSP *eq, double frequency, double amplitude, int frames) {
  for (int i = 0; i < frames; i++) {
    DNEQBeginFrame(eq);
    float out = DNEQProcessSample(eq, 0, (float)(amplitude * sin(2 * DN_EQ_PI * frequency * i / eq->sampleRate)));
    assert(isfinite(out) && fabs(out) <= 1);
  }
}
static double tone(DNEqualizerDSP *eq, double frequency) {
  settle(eq, frequency, 0.2, (int)eq->sampleRate);
  double energy = 0;
  for (int i = 0; i < (int)eq->sampleRate; i++) {
    DNEQBeginFrame(eq);
    double out = DNEQProcessSample(eq, 0, (float)(0.2 * sin(2 * DN_EQ_PI * frequency * i / eq->sampleRate)));
    energy += out * out;
  }
  return sqrt(energy / eq->sampleRate);
}

int main(void) {
  const double rates[] = {22050, 44100, 48000, 96000};
  for (unsigned r = 0; r < sizeof(rates) / sizeof(rates[0]); r++) {
    DNEqualizerDSP eq;
    DNEQPrepare(&eq, rates[r]);
    assert(DNEQProcessSample(&eq, 0, 0.125f) == 0.125f);
    float gains[DN_EQ_BANDS] = {0};
    DNEQSetTarget(&eq, true, gains);
    DNEQBeginFrame(&eq);
    assert(eq.bypass && DNEQProcessSample(&eq, 0, -0.4f) == -0.4f);

    gains[5] = -12;
    DNEQSetTarget(&eq, true, gains);
    double center = tone(&eq, 1000), low = tone(&eq, 62);
    assert(center < low * 0.3 && center > low * 0.2);

    // No cross-channel state: an impulse in left must not leak into right.
    DNEQPrepare(&eq, rates[r]);
    DNEQSetTarget(&eq, true, gains);
    for (int i = 0; i < 5000; i++) {
      DNEQBeginFrame(&eq);
      DNEQProcessSample(&eq, 0, i == 0 ? 1 : 0);
      assert(DNEQProcessSample(&eq, 1, 0) == 0);
    }

    for (int band = 0; band < DN_EQ_BANDS; band++) gains[band] = 12;
    DNEQSetTarget(&eq, true, gains);
    settle(&eq, 1000, 0.95, (int)rates[r]);
    assert(eq.preamp < 0.25 && eq.preamp > 0);
    for (int bin = 0; bin < 2000; bin++) {
      double frequency = 10 * pow(rates[r] * 0.049, bin / 1999.0), response = eq.preamp * eq.preamp;
      for (int band = 0; band < DN_EQ_BANDS; band++) response *= DNEQResponseSquared(eq.coefficients[band], 2 * DN_EQ_PI * frequency / rates[r]);
      assert(response < 1.01);
    }

    // A new gesture keeps the previous delay line, then interpolates coefficients.
    double previous = eq.channels[0][5].x1;
    gains[5] = -12;
    DNEQSetTarget(&eq, true, gains);
    assert(eq.channels[0][5].x1 == previous);
    DNEQBeginFrame(&eq);
    assert(eq.gains[5] > -12 && eq.gains[5] < 12);
    settle(&eq, 1000, 0.8, (int)rates[r]);
    DNEQSetTarget(&eq, false, gains);
    settle(&eq, 1000, 0.8, (int)rates[r]);
    assert(eq.bypass && eq.preamp == 1);
    assert(DNEQProcessSample(&eq, 0, 0.125f) == 0.125f);
    gains[0] = NAN; gains[1] = INFINITY;
    DNEQSetTarget(&eq, true, gains);
    assert(eq.targets[0] == 0 && eq.targets[1] == 0);
    assert(DNEQProcessSample(&eq, 0, NAN) == 0);
    settle(&eq, 1000, 0.9, (int)rates[r]);
  }
  puts("DSP OK: flat/bypass, frequency response, stereo isolation, headroom, smoothing, sample rates, finite values");
  return 0;
}
