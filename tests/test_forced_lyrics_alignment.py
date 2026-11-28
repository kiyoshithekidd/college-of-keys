"""Offline checks for the known-lyrics alignment result."""
import importlib.machinery
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python_ml"))
import transcribe_quest


class KnownLyricsAlignmentTests(unittest.TestCase):
    def setUp(self):
        self.runtime = ModuleType("stable_whisper")
        self.runtime.__spec__ = importlib.machinery.ModuleSpec("stable_whisper", None)
        self.runtime.load_model = Mock()
        self.model = self.runtime.load_model.return_value
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.vocals = Path(self.temp.name, "vocals.wav")
        self.vocals.touch()
        runtime_patch = patch.dict(sys.modules, stable_whisper=self.runtime)
        runtime_patch.start()
        self.addCleanup(runtime_patch.stop)
        log_patch = patch.object(transcribe_quest, "log_status")
        self.log = log_patch.start()
        self.addCleanup(log_patch.stop)

    def align(self, language="auto"):
        return transcribe_quest._align_known_lyrics_to_vocals(self.vocals, "Luz azul", language)

    def test_cuda_result_round_trips_through_the_app_parser(self):
        self.model.align.return_value = SimpleNamespace(segments=[
            SimpleNamespace(start=1.20, words=[
                SimpleNamespace(start=1.25, word=" Luz"),
                SimpleNamespace(start=1.62, word=" cálida"),
            ]),
            SimpleNamespace(start=2.5, words=[], text=" canción azul "),
        ])
        lrc = self.align("es")
        self.assertEqual(lrc, "[00:01.25] <00:01.25> Luz <00:01.62> cálida\n[00:02.50] canción azul\n")
        self.runtime.load_model.assert_called_once_with("base", device="cuda")
        self.model.align.assert_called_once_with(str(self.vocals), "Luz azul", language="es")
        subprocess.run(["node", "-e", """
const assert = require('node:assert/strict');
const { parseEnhancedLrcText } = require('./lyrics-fetcher');
const lines = parseEnhancedLrcText(require('node:fs').readFileSync(0, 'utf8'));
assert.equal(lines.length, 2);
assert.deepEqual(lines[0].words.map(w => w.text), ['Luz', 'cálida']);
assert.equal(lines[1].text, 'canción azul');
"""], cwd=ROOT, input=lrc, text=True, check=True)

    def test_retries_a_backend_error_once_on_cpu(self):
        self.model.align.side_effect = [
            RuntimeError("CUDA unavailable"),
            SimpleNamespace(segments=[SimpleNamespace(start=3, text="voz")]),
        ]
        self.assertEqual(self.align(), "[00:03.00] voz\n")
        self.assertEqual([c.kwargs["device"] for c in self.runtime.load_model.call_args_list], ["cuda", "cpu"])

    def test_does_not_retry_formatting_failure(self):
        self.model.align.return_value = SimpleNamespace(segments=[SimpleNamespace(start=float("inf"), text="voz")])
        self.assertEqual(self.align(), "")
        self.runtime.load_model.assert_called_once_with("base", device="cuda")
        self.assertTrue(any("format" in str(c).lower() for c in self.log.call_args_list))


if __name__ == "__main__":
    unittest.main()
