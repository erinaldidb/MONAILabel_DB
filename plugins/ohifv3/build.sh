#!/bin/bash

# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

curr_dir="$(pwd)"
my_dir="$(dirname "$(readlink -f "$0")")"

echo "Installing requirements..."
sh $my_dir/requirements.sh

install_dir=${1:-$my_dir/../../monailabel/endpoints/static/ohif}

echo "Current Dir: ${curr_dir}"
echo "My Dir: ${my_dir}"
echo "Installing OHIF at: ${install_dir}"

cd ${my_dir}
rm -rf Viewers
git clone https://github.com/OHIF/Viewers.git
cd Viewers
git checkout 1ad5acae9d75259374f968b1c2dd17a581bdd9a4

#cp -r ../extensions/monai-label extensions/
#cp -r ../modes/monai-label modes/monai-label
cd extensions
ln -s ../../extensions/monai-label monai-label
cd ..

cd modes
ln -s ../../modes/monai-label monai-label
cd ..

git apply ../extensions.patch

cp ${curr_dir}/../plugins/ohifv3/config/databricks.js platform/app/public/config/databricks.js

#copy Databricks Pixels integration
echo "Installing Databricks Integration"
mkdir ./extensions/default/src/DatabricksPixelsDicom/
cp ${curr_dir}/../plugins/ohifv3/extensions/default/src/DatabricksPixelsDicom/index.js ./extensions/default/src/DatabricksPixelsDicom/index.js
cp ${curr_dir}/../plugins/ohifv3/extensions/default/src/DatabricksPixelsDicom/utils.js ./extensions/default/src/DatabricksPixelsDicom/utils.js
cp ${curr_dir}/../plugins/ohifv3/extensions/default/src/DatabricksPixelsDicom/fixMultipart.ts ./extensions/default/src/DatabricksPixelsDicom/fixMultipart.ts
cp ${curr_dir}/../plugins/ohifv3/extensions/default/src/DatabricksPixelsDicom/StaticWadoClient.ts ./extensions/default/src/DatabricksPixelsDicom/StaticWadoClient.ts
cp ${curr_dir}/../plugins/ohifv3/extensions/default/src/DatabricksPixelsDicom/findIndexOfString.ts ./extensions/default/src/DatabricksPixelsDicom/findIndexOfString.ts
cp ${curr_dir}/../plugins/ohifv3/extensions/default/src/getDataSourcesModule.js ./extensions/default/src/getDataSourcesModule.js
cp ${curr_dir}/../plugins/ohifv3/extensions/cornerstone-dicom-seg/src/commandsModule.ts ./extensions/cornerstone-dicom-seg/src/commandsModule.ts

yarn config set workspaces-experimental true
yarn install
yarn run cli list

#patching dicom-microscopy
sed -i.bak 's/extensionManager.activeDataSource/extensionManager.activeDataSourceName/g' ./extensions/dicom-microscopy/src/utils/dicomWebClient.ts && rm ./extensions/dicom-microscopy/src/utils/dicomWebClient.ts.bak
sed -i.bak 's/\/dicom-microscopy-viewer\/dicomMicroscopyViewer.min.js/dicom-microscopy-viewer\/dicomMicroscopyViewer.min.js/g' ./platform/app/pluginConfig.json && rm ./platform/app/pluginConfig.json.bak

APP_CONFIG=config/databricks.js PUBLIC_URL=./ QUICK_BUILD=true yarn run build

rm -rf ${install_dir}
cp -r platform/app/dist/ ${install_dir}
echo "Copied OHIF to ${install_dir}"

cd ..
rm -rf Viewers
find .  -type d -name "node_modules" -exec rm -rf "{}" +

echo "Patching index.html"
cd ${install_dir}
sed -i.bak 's/app-config.js/app-config-custom.js/g' index.html && rm index.html.bak
echo "OHIF for databricks created"

cd ${curr_dir}
