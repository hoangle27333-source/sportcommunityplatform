"""Train/evaluate the frozen multilingual encoder's account classifier offline.
Requires numpy and scikit-learn. Never creates labels or activates a model.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score
from sklearn.model_selection import GroupShuffleSplit

CLASSES = ['Individual', 'Community', 'Club', 'Brand/Business', 'Media/Event', 'Other']
PLATFORMS = ['Instagram', 'TikTok', 'Facebook']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    raw = Path(args.input).read_bytes()
    dataset = json.loads(raw)
    rows = dataset['rows']
    if dataset['featureVersion'] != 'profile-post-mean-128-v1':
        raise ValueError('Unsupported feature contract')
    if len(rows) < 900:
        raise ValueError('At least 900 reviewed accounts are required for the initial benchmark')
    for row in rows:
        if row['label'] not in CLASSES or row['platform'] not in PLATFORMS or not row.get('subjectKey') or not row.get('reviewers') or len(row['features']) != 770:
            raise ValueError('Invalid reviewed feature record')
    for label in CLASSES:
        for platform in PLATFORMS:
            if sum(r['label'] == label and r['platform'] == platform for r in rows) < 50:
                raise ValueError(f'Need 50 reviewed records for {platform}/{label}')
    x = np.asarray([r['features'] for r in rows], dtype=float)
    y = np.asarray([r['label'] for r in rows])
    groups = np.asarray([r['subjectKey'] for r in rows])
    if not np.isfinite(x).all():
        raise ValueError('Non-finite features')
    train, rest = next(GroupShuffleSplit(n_splits=1, train_size=.6, random_state=42).split(x, y, groups))
    calibration_i, test_i = next(GroupShuffleSplit(n_splits=1, train_size=.5, random_state=43).split(x[rest], y[rest], groups[rest]))
    calibration, test = rest[calibration_i], rest[test_i]
    if set(y[train]) != set(CLASSES):
        raise ValueError('Training split lacks a class; add independently grouped reviewed accounts')
    if any(len(set(rows[i]['reviewers'])) < 2 for i in test):
        raise ValueError('Test accounts require two independent reviewers')
    model = LogisticRegression(max_iter=2000, class_weight='balanced', random_state=42).fit(x[train], y[train])
    classes = list(model.classes_)
    cal_prob = model.predict_proba(x[calibration])
    cal_pred = model.predict(x[calibration])
    thresholds = {}
    for index, label in enumerate(classes):
        for threshold in np.arange(.5, 1.0, .01):
            selected = (cal_pred == label) & (cal_prob[:, index] >= threshold)
            if selected.sum() >= 10 and (y[calibration][selected] == label).mean() >= .9:
                thresholds[label] = float(threshold)
                break
    pred = model.predict(x[test])
    prob = model.predict_proba(x[test])
    accepted = np.asarray([prob[i, classes.index(label)] >= thresholds.get(label, 2) for i, label in enumerate(pred)])
    metrics = {'macroF1': float(f1_score(y[test], pred, labels=CLASSES, average='macro', zero_division=0)), 'coverage': float(accepted.mean()), 'confusionMatrix': confusion_matrix(y[test], pred, labels=CLASSES).tolist(), 'classOrder': CLASSES, 'slices': []}
    rule_pred = np.asarray([rows[i].get('ruleSuggestedType', 'Unknown') for i in test])
    metrics['ruleBaseline'] = {'macroF1': float(f1_score(y[test], rule_pred, labels=CLASSES, average='macro', zero_division=0)), 'unknownRate': float((rule_pred == 'Unknown').mean()), 'confusionMatrix': confusion_matrix(y[test], rule_pred, labels=CLASSES + ['Unknown']).tolist()}
    metrics['modelUnknownRate'] = float((~accepted).mean())
    gate = metrics['macroF1'] >= .8 and metrics['coverage'] >= .6 and len(thresholds) == 6
    for label in CLASSES:
        for platform in PLATFORMS:
            platform_mask = np.asarray([rows[i]['platform'] == platform for i in test])
            selected = accepted & (pred == label) & platform_mask
            actual = (y[test] == label) & platform_mask
            precision = float((y[test][selected] == label).mean()) if selected.any() else None
            recall = float(((pred == label) & accepted & actual).sum() / actual.sum()) if actual.any() else None
            metrics['slices'].append({'label': label, 'platform': platform, 'accepted': int(selected.sum()), 'actual': int(actual.sum()), 'precision': precision, 'recall': recall})
            gate = gate and selected.sum() >= 10 and precision is not None and precision >= .9
    receipt = {'datasetHash': hashlib.sha256(raw).hexdigest(), 'split': {name: [rows[i]['accountKey'] for i in indices] for name, indices in [('train', train), ('calibration', calibration), ('test', test)]}, 'metrics': metrics, 'qualityGate': bool(gate)}
    manifest = {key: dataset[key] for key in ['featureVersion', 'encoder', 'revision', 'artifacts']}
    manifest.update(version=args.version, classes=classes, coefficients=model.coef_.tolist(), intercepts=model.intercept_.tolist(), thresholds=thresholds, qualityGate=bool(gate), runtimeGate=False, testReceipt=hashlib.sha256(json.dumps(receipt, sort_keys=True).encode()).hexdigest())
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    (output / 'benchmark.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps({'qualityGate': bool(gate), 'runtimeGate': False, 'macroF1': metrics['macroF1'], 'coverage': metrics['coverage']}))


if __name__ == '__main__':
    main()
