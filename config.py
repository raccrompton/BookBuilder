import yaml
import addict


yaml_location = input('What is the full path to your config.yaml file? (ie. /Users/youruser/BookBuilder/config.yaml): ')
with open(yaml_location, "r") as f:
    config = addict.Dict(yaml.safe_load(f))