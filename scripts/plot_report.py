"""Optional report figure. Requires matplotlib; app/rebuild do not require Python."""
from pathlib import Path
import json
import os
import tempfile
os.environ.setdefault('MPLCONFIGDIR',str(Path(tempfile.gettempdir())/'evidence-desk-mpl'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
report=json.loads((ROOT/'reports/evaluation.json').read_text(encoding='utf-8'))
t=report['test']
fig,axes=plt.subplots(1,2,figsize=(11,4.5),layout='constrained')
fig.set_facecolor('#f7f7f3')
names=['BM25','Dense','Hybrid']
values=[t['retrieval'][key]['mrr'] for key in ['lexical','semantic','hybrid']]
axes[0].bar(names,values,color=['#476b6b','#a8b7ab','#d7c9ae'],width=.55)
axes[0].set(ylim=(0,1),ylabel='Mean reciprocal rank at 5',title='Relevant-page retrieval')
a=t['answerability']
axes[1].bar(['Answerable: answered','Answerable: declined','Unsupported: answered','Unsupported: declined'],[a['tp'],a['fn'],a['fp'],a['tn']],color=['#6e9279','#d8c6a6','#b97e65','#a8b7ab'],width=.6)
axes[1].tick_params(axis='x',rotation=25,labelsize=8)
axes[1].set(ylabel='Question count',title='Acceptance is a trade-off')
for ax in axes:ax.spines[['top','right']].set_visible(False)
fig.supxlabel('14 hand-written final diagnostic questions; 10 answerable and 4 unsupported. Not a production accuracy estimate.',fontsize=8)
fig.savefig(ROOT/'reports/evaluation.png',dpi=170)
plt.close(fig)
print('Created reports/evaluation.png')
